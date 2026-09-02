import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, documentSections, sectionReviews } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import { InlineDocReviewForm } from "@/components/inline-doc-review-form";
import { SectionCommentForm } from "@/components/section-comment-form";
import { getApartadoStatusesForInstitution } from "@/lib/sede-status";
import { requestReReview, markTrasladoEafit, markEntregadoCpe } from "./actions";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";
import type { ReviewStatus } from "@/lib/db/types";

const ACTOR_LABELS: Record<string, string> = {
  estudiantes: "Estudiantes",
  docentes: "Docentes",
  directivos: "Directivos",
  familias: "Familias",
};

interface AvanceApartadoRow {
  apartado: string;
  documentos_esperados: number;
  documentos_cumple: number;
  porcentaje_cumplimiento: number | null;
}

interface CommentSummary {
  comment: string | null;
  createdAt: Date;
  count: number;
}

export default async function SedeDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ institutionId: string }>;
  searchParams: Promise<{ error?: string; success?: string; open?: string }>;
}) {
  const profile = await getCurrentProfile();
  const { institutionId } = await params;
  const { error: submitError, success: submitSuccess, open: openSectionId } = await searchParams;
  const canComment = ["administrador", "coordinador", "revisor"].includes(profile.role);
  const canRequestReReview = profile.role === "administrador" || profile.role === "coordinador";
  const canMarkTrasladoEafit = profile.role === "administrador" || profile.role === "sgd";
  const canMarkEntregadoCpe = profile.role === "administrador" || profile.role === "coordinador_eafit";

  const visibleIds = await visibleInstitutionIds(profile);
  if (visibleIds !== null && !visibleIds.includes(institutionId)) {
    notFound();
  }

  let institutionError: string | null = null;
  let dataError: string | null = null;
  let sede: typeof institutions.$inferSelect | undefined;
  let avanceRows: AvanceApartadoRow[] = [];
  let documentRows: EstadoActualRow[] = [];
  let sectionIdByName = new Map<string, string>();
  let apartadoStatusBySectionId = new Map<string, ReviewStatus>();
  const commentBySectionId = new Map<string, CommentSummary>();

  try {
    [sede] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  } catch (e) {
    institutionError = e instanceof Error ? e.message : "Error desconocido";
  }

  if (!institutionError && !sede) notFound();

  if (!institutionError) {
    try {
      const [avanceResult, docsResult, sectionRows, commentRows, statusMap] = await Promise.all([
        db.execute(sql`
          select apartado, documentos_esperados, documentos_cumple, porcentaje_cumplimiento
          from vw_avance_sede_apartado
          where institution_id = ${institutionId}
          order by apartado asc
        `),
        db.execute(sql`
          select * from vw_estado_actual_documentos
          where institution_id = ${institutionId}
          order by apartado asc, actor asc nulls first, sesion asc nulls first, evidencia asc
        `),
        db.select({ id: documentSections.id, name: documentSections.name }).from(documentSections),
        db
          .select()
          .from(sectionReviews)
          .where(eq(sectionReviews.institutionId, institutionId))
          .orderBy(desc(sectionReviews.createdAt)),
        getApartadoStatusesForInstitution(institutionId),
      ]);
      avanceRows = avanceResult as unknown as AvanceApartadoRow[];
      documentRows = docsResult as unknown as EstadoActualRow[];
      sectionIdByName = new Map(sectionRows.map((s) => [s.name, s.id]));
      apartadoStatusBySectionId = statusMap;

      // commentRows viene desc por fecha: la primera vez que vemos un section_id es su
      // comentario general más reciente; de paso contamos cuántos comentarios tiene.
      const counts = new Map<string, number>();
      for (const r of commentRows) {
        counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
        if (!commentBySectionId.has(r.sectionId)) {
          commentBySectionId.set(r.sectionId, { comment: r.comment, createdAt: r.createdAt, count: 0 });
        }
      }
      for (const [sectionId, summary] of commentBySectionId) {
        summary.count = counts.get(sectionId) ?? 0;
      }
    } catch (e) {
      dataError = e instanceof Error ? e.message : "Error desconocido";
    }
  }

  if (institutionError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
      >
        No se pudo cargar la sede: {institutionError}
      </div>
    );
  }

  if (!sede) notFound();

  const totalEsperados = avanceRows.reduce((sum, a) => sum + a.documentos_esperados, 0);
  const totalCumple = avanceRows.reduce((sum, a) => sum + a.documentos_cumple, 0);
  const porcentajeGeneral = totalEsperados > 0 ? Math.round((totalCumple / totalEsperados) * 100) : 0;
  const totalComentariosApartados = [...commentBySectionId.values()].reduce((sum, s) => sum + s.count, 0);

  // "Trasladado a revisión SGD": todos los apartados con documentos esperados en esta
  // sede quedaron en "Cumple" según el cálculo automático (ver src/lib/sede-status.ts).
  const apartadosConSectionId = avanceRows
    .map((a) => sectionIdByName.get(a.apartado))
    .filter((id): id is string => Boolean(id));
  const trasladadoRevisionSgd =
    apartadosConSectionId.length > 0 &&
    apartadosConSectionId.every((id) => apartadoStatusBySectionId.get(id) === "cumple");

  const documentsByApartado = new Map<string, EstadoActualRow[]>();
  for (const doc of documentRows) {
    const list = documentsByApartado.get(doc.apartado) ?? [];
    list.push(doc);
    documentsByApartado.set(doc.apartado, list);
  }

  function barColor(pct: number) {
    return pct >= 80 ? "bg-status-cumple" : pct >= 40 ? "bg-status-subsanar" : "bg-status-no-esta";
  }

  return (
    <div className="space-y-6">
      <Link href="/sedes" className="text-sm font-medium text-brand-primary hover:underline">
        ← Volver al explorador de sedes
      </Link>

      {submitError ? (
        <div role="alert" className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
          {submitError}
        </div>
      ) : null}
      {submitSuccess ? (
        <div role="status" className="rounded-md border border-status-cumple/30 bg-status-cumple/10 px-3 py-2 text-sm text-status-cumple">
          {submitSuccess}
        </div>
      ) : null}

      {sede.reReviewRequestedAt ? (
        <div role="alert" className="rounded-lg border border-status-subsanar/30 bg-status-subsanar/10 px-4 py-3 text-sm text-status-subsanar">
          <p className="font-semibold">La coordinación pidió volver a revisar esta sede</p>
          <p className="mt-0.5 text-foreground-muted">
            Solicitado el {new Date(sede.reReviewRequestedAt).toLocaleDateString("es-CO")} — quedan{" "}
            {sede.reReviewPendingDocumentIds?.length ?? 0} documento(s) sin un veredicto nuevo desde entonces.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{sede.sedeName}</h1>
            <p className="text-sm text-foreground-muted">{sede.institutionName}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {trasladadoRevisionSgd ? (
              <span className="rounded-full bg-brand-secondary/15 px-3 py-1 text-xs font-semibold text-brand-secondary">
                Trasladado a revisión SGD
              </span>
            ) : null}
            {sede.traspasoEafitAt ? (
              <span className="rounded-full bg-brand-accent/15 px-3 py-1 text-xs font-semibold text-brand-accent">
                Traslado EAFIT
              </span>
            ) : null}
            {sede.entregadoCpeAt ? (
              <span className="rounded-full bg-status-cumple/15 px-3 py-1 text-xs font-semibold text-status-cumple">
                Entregado a CPE
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {canRequestReReview ? (
            <form action={requestReReview}>
              <input type="hidden" name="institution_id" value={institutionId} />
              <button
                type="submit"
                className="rounded-md border border-status-subsanar/40 px-3 py-1.5 text-xs font-medium text-status-subsanar hover:bg-status-subsanar/10"
              >
                Solicitar nueva revisión
              </button>
            </form>
          ) : null}
          {canMarkTrasladoEafit && trasladadoRevisionSgd && !sede.traspasoEafitAt ? (
            <form action={markTrasladoEafit}>
              <input type="hidden" name="institution_id" value={institutionId} />
              <button
                type="submit"
                className="rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Marcar Traslado EAFIT
              </button>
            </form>
          ) : null}
          {canMarkEntregadoCpe && sede.traspasoEafitAt && !sede.entregadoCpeAt ? (
            <form action={markEntregadoCpe}>
              <input type="hidden" name="institution_id" value={institutionId} />
              <button
                type="submit"
                className="rounded-md bg-status-cumple px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Marcar Entregado a CPE
              </button>
            </form>
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground-muted">DANE</dt>
            <dd className="text-foreground">{sede.daneCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Municipio</dt>
            <dd className="text-foreground">
              {sede.municipality}, {sede.department}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Línea CPE</dt>
            <dd className="text-foreground">{sede.linea}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Coordinador / Mentor</dt>
            <dd className="text-foreground">
              {sede.coordinatorName ?? "—"} / {sede.mentorName ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Comentarios generales registrados</dt>
            <dd className="text-foreground">{totalComentariosApartados}</dd>
          </div>
        </dl>

        {dataError ? (
          <div role="alert" className="mt-4 rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
            No se pudo cargar el avance: {dataError}
          </div>
        ) : totalEsperados === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-foreground-muted">
            Todavía no hay documentos esperados generados para esta sede. Genera los documentos
            desde <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-muted">
              <div className={`h-full ${barColor(porcentajeGeneral)}`} style={{ width: `${porcentajeGeneral}%` }} />
            </div>
            <span className="shrink-0 text-sm font-semibold text-foreground">
              {porcentajeGeneral}% ({totalCumple}/{totalEsperados})
            </span>
          </div>
        )}
      </div>

      {avanceRows.length > 0 ? (
        <div className="space-y-3">
          {avanceRows.map((apartado) => {
            const pct = apartado.porcentaje_cumplimiento ?? 0;
            const docs = documentsByApartado.get(apartado.apartado) ?? [];
            const sectionId = sectionIdByName.get(apartado.apartado);
            const apartadoStatus = sectionId ? apartadoStatusBySectionId.get(sectionId) ?? "pendiente_revision" : "pendiente_revision";
            const comentario = sectionId ? commentBySectionId.get(sectionId) : undefined;
            // Un mismo apartado puede combinar varios actores (07-10); si todos comparten
            // documentSection distinto no lo sabemos aquí por nombre, así que agrupamos
            // adicionalmente por actor dentro del bloque para que se lea claro.
            const docsByActor = new Map<string, EstadoActualRow[]>();
            for (const d of docs) {
              const key = d.actor ?? "__general__";
              const list = docsByActor.get(key) ?? [];
              list.push(d);
              docsByActor.set(key, list);
            }

            return (
              <details
                key={apartado.apartado}
                id={sectionId ?? undefined}
                className="rounded-lg border border-border bg-surface shadow-sm scroll-mt-4"
                open={sectionId != null && sectionId === openSectionId ? true : undefined}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{apartado.apartado}</p>
                      <StatusBadge status={apartadoStatus} />
                      <span className="text-xs text-foreground-muted" title="Calculado a partir de los documentos obligatorios de esta carpeta">
                        estado automático
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted">
                        <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {pct}% documentos ({apartado.documentos_cumple}/{apartado.documentos_esperados})
                      </span>
                    </div>
                    {comentario?.comment ? (
                      <p className="mt-1 text-xs text-foreground-muted">
                        Último comentario: {comentario.comment}
                      </p>
                    ) : null}
                  </div>
                  {canComment ? (
                    <span className="shrink-0 text-xs font-medium text-brand-primary underline-offset-2">
                      Ver detalle
                    </span>
                  ) : null}
                </summary>

                <div className="space-y-4 border-t border-border p-4">
                  {canComment && sectionId ? (
                    <SectionCommentForm
                      institutionId={institutionId}
                      sectionId={sectionId}
                      returnTo={`/sedes/${institutionId}?open=${sectionId}#${sectionId}`}
                      status={apartadoStatus}
                    />
                  ) : null}

                  {[...docsByActor.entries()].map(([actor, actorDocs]) => {
                    const returnTo = sectionId
                      ? `/sedes/${institutionId}?open=${sectionId}#${sectionId}`
                      : `/sedes/${institutionId}`;
                    const isPorSesion = actor !== "__general__";

                    function renderDocsTable(docs: EstadoActualRow[]) {
                      return (
                        <div className="overflow-x-auto rounded-md border border-border">
                          <table className="w-full min-w-[700px] text-left text-sm">
                            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                              <tr>
                                <th className="px-3 py-2 font-medium">Evidencia</th>
                                <th className="px-3 py-2 font-medium">Obligatorio</th>
                                <th className="px-3 py-2 font-medium">Estado</th>
                                <th className="px-3 py-2 font-medium">Fecha</th>
                                <th className="px-3 py-2 font-medium">Marcar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {docs.map((doc) => (
                                <tr key={doc.expected_document_id} className="border-b border-border last:border-0">
                                  <td className="px-3 py-2 text-foreground">{doc.evidencia}</td>
                                  <td className="px-3 py-2 text-foreground-muted">{doc.obligatorio ? "Sí" : "No"}</td>
                                  <td className="px-3 py-2">
                                    <StatusBadge status={doc.estado_actual} />
                                  </td>
                                  <td className="px-3 py-2 text-xs text-foreground-muted whitespace-nowrap">
                                    {doc.fecha_ultima_revision
                                      ? new Date(doc.fecha_ultima_revision).toLocaleDateString("es-CO")
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <InlineDocReviewForm
                                      expectedDocumentId={doc.expected_document_id}
                                      currentStatus={doc.estado_actual}
                                      returnTo={returnTo}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    // Algunas evidencias (ej. lista de asistencia física, registro Qualtrics)
                    // son un solo documento por carpeta/actor, no uno por cada sesión — van
                    // sueltas, fuera de las sub-secciones de sesión (ver es_por_sesion).
                    const generales = actorDocs.filter((d) => !d.es_por_sesion);
                    const porSesionDocs = actorDocs.filter((d) => d.es_por_sesion);

                    const bySesion = new Map<string, EstadoActualRow[]>();
                    for (const d of porSesionDocs) {
                      const key = isPorSesion ? String(d.numero_sesion ?? "—") : "__todos__";
                      const list = bySesion.get(key) ?? [];
                      list.push(d);
                      bySesion.set(key, list);
                    }
                    const sesionKeys = [...bySesion.keys()].sort((a, b) =>
                      a === "—" || b === "—" ? 0 : Number(a) - Number(b)
                    );

                    return (
                      <div key={actor}>
                        {actor !== "__general__" ? (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                            {ACTOR_LABELS[actor] ?? actor}
                          </p>
                        ) : null}

                        {generales.length > 0 ? <div className="mb-2">{renderDocsTable(generales)}</div> : null}

                        {sesionKeys.map((sesionKey) => {
                          const sesionDocs = bySesion.get(sesionKey) ?? [];
                          const table = renderDocsTable(sesionDocs);

                          if (!isPorSesion) return <div key={sesionKey}>{table}</div>;

                          return (
                            <details key={sesionKey} className="mb-2 rounded-md border border-border" open>
                              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-foreground-muted">
                                Sesión {sesionKey}{" "}
                                <span className="font-normal">
                                  ({sesionDocs.filter((d) => d.estado_actual === "cumple").length}/{sesionDocs.length}{" "}
                                  documentos cumplen)
                                </span>
                              </summary>
                              <div className="border-t border-border p-2">{table}</div>
                            </details>
                          );
                        })}
                      </div>
                    );
                  })}

                  {canComment && sectionId ? (
                    <Link
                      href={`/sedes/${institutionId}/comentarios/${sectionId}`}
                      className="inline-block text-sm font-medium text-brand-primary hover:underline"
                    >
                      Ver comentarios de este apartado →
                    </Link>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
