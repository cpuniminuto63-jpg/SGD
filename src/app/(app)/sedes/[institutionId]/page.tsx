import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, documentSections, sectionReviews } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import { submitSectionReview } from "../actions";
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

interface SectionReviewSummary {
  status: ReviewStatus;
  comment: string | null;
  createdAt: Date;
  count: number;
}

export default async function SedeDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ institutionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  const { institutionId } = await params;
  const { error: submitError } = await searchParams;
  const canComment = ["administrador", "coordinador", "revisor"].includes(profile.role);

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
  const sectionReviewBySectionId = new Map<string, SectionReviewSummary>();

  try {
    [sede] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  } catch (e) {
    institutionError = e instanceof Error ? e.message : "Error desconocido";
  }

  if (!institutionError && !sede) notFound();

  if (!institutionError) {
    try {
      const [avanceResult, docsResult, sectionRows, reviewRows] = await Promise.all([
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
      ]);
      avanceRows = avanceResult as unknown as AvanceApartadoRow[];
      documentRows = docsResult as unknown as EstadoActualRow[];
      sectionIdByName = new Map(sectionRows.map((s) => [s.name, s.id]));

      // reviewRows ya viene ordenado desc por fecha: la primera vez que vemos un
      // section_id es su veredicto vigente; de paso contamos cuántos veredictos tiene.
      const counts = new Map<string, number>();
      for (const r of reviewRows) {
        counts.set(r.sectionId, (counts.get(r.sectionId) ?? 0) + 1);
        if (!sectionReviewBySectionId.has(r.sectionId)) {
          sectionReviewBySectionId.set(r.sectionId, {
            status: r.status,
            comment: r.comment,
            createdAt: r.createdAt,
            count: 0, // se completa abajo
          });
        }
      }
      for (const [sectionId, summary] of sectionReviewBySectionId) {
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
  const totalRevisionesApartados = [...sectionReviewBySectionId.values()].reduce((sum, s) => sum + s.count, 0);

  // "Trasladado a revisión SGD": todos los apartados con documentos esperados en esta
  // sede tienen un veredicto manual vigente de 'cumple'. Estado derivado, no almacenado.
  const apartadosConSectionId = avanceRows
    .map((a) => sectionIdByName.get(a.apartado))
    .filter((id): id is string => Boolean(id));
  const trasladadoRevisionSgd =
    apartadosConSectionId.length > 0 &&
    apartadosConSectionId.every((id) => sectionReviewBySectionId.get(id)?.status === "cumple");
  // Fecha del traslado: la más tardía entre los veredictos de "cumple" de cada apartado
  // (el que faltaba para completar el traslado).
  const fechaTrasladoRevisionSgd = trasladadoRevisionSgd
    ? apartadosConSectionId.reduce<Date | null>((max, id) => {
        const createdAt = sectionReviewBySectionId.get(id)?.createdAt;
        return createdAt && (!max || createdAt > max) ? createdAt : max;
      }, null)
    : null;

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

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{sede.sedeName}</h1>
            <p className="text-sm text-foreground-muted">{sede.institutionName}</p>
          </div>
          {trasladadoRevisionSgd ? (
            <span className="shrink-0 rounded-full bg-brand-secondary/15 px-3 py-1 text-xs font-semibold text-brand-secondary">
              Trasladado a revisión SGD
              {fechaTrasladoRevisionSgd ? (
                <span className="ml-1 font-normal opacity-80">
                  · {new Date(fechaTrasladoRevisionSgd).toLocaleDateString("es-CO")}
                </span>
              ) : null}
            </span>
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
            <dt className="text-xs text-foreground-muted">Veredictos de apartado registrados</dt>
            <dd className="text-foreground">{totalRevisionesApartados}</dd>
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
            const sectionReview = sectionId ? sectionReviewBySectionId.get(sectionId) : undefined;
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
              <details key={apartado.apartado} className="rounded-lg border border-border bg-surface shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{apartado.apartado}</p>
                      <StatusBadge status={sectionReview?.status ?? "pendiente_revision"} />
                      {sectionReview?.createdAt ? (
                        <span className="text-xs text-foreground-muted">
                          desde {new Date(sectionReview.createdAt).toLocaleDateString("es-CO")}
                        </span>
                      ) : null}
                      <span className="text-xs text-foreground-muted">
                        {sectionReview?.count ?? 0} veredicto{sectionReview?.count === 1 ? "" : "s"} de apartado
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
                    {sectionReview?.comment ? (
                      <p className="mt-1 text-xs text-foreground-muted">
                        Último comentario: {sectionReview.comment}
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
                    <form
                      action={submitSectionReview}
                      className="rounded-md border border-dashed border-border p-3"
                    >
                      <input type="hidden" name="institution_id" value={institutionId} />
                      <input type="hidden" name="section_id" value={sectionId} />
                      <input type="hidden" name="return_to" value={`/sedes/${institutionId}`} />
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        Marcar veredicto de este apartado
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label
                            htmlFor={`status-${sectionId}`}
                            className="mb-1 block text-xs font-medium text-foreground-muted"
                          >
                            Estado
                          </label>
                          <select
                            id={`status-${sectionId}`}
                            name="status"
                            required
                            defaultValue="cumple"
                            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                          >
                            {REVIEW_STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>
                                {REVIEW_STATUS_META[s].label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-[220px] flex-1">
                          <label
                            htmlFor={`comment-${sectionId}`}
                            className="mb-1 block text-xs font-medium text-foreground-muted"
                          >
                            Comentario (obligatorio si no es &quot;Cumple&quot;)
                          </label>
                          <input
                            id={`comment-${sectionId}`}
                            name="comment"
                            type="text"
                            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                          />
                        </div>
                        <button
                          type="submit"
                          className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-primary-hover"
                        >
                          Guardar
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {[...docsByActor.entries()].map(([actor, actorDocs]) => (
                    <div key={actor}>
                      {actor !== "__general__" ? (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                          {ACTOR_LABELS[actor] ?? actor}
                        </p>
                      ) : null}
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[600px] text-left text-sm">
                          <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                            <tr>
                              <th className="px-3 py-2 font-medium">Sesión</th>
                              <th className="px-3 py-2 font-medium">Evidencia</th>
                              <th className="px-3 py-2 font-medium">Obligatorio</th>
                              <th className="px-3 py-2 font-medium">Estado</th>
                              <th className="px-3 py-2 font-medium">Fecha</th>
                              <th className="px-3 py-2 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {actorDocs.map((doc) => (
                              <tr key={doc.expected_document_id} className="border-b border-border last:border-0">
                                <td className="px-3 py-2 text-foreground-muted">{doc.sesion ?? "—"}</td>
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
                                <td className="px-3 py-2 text-right">
                                  <Link
                                    href={`/mi-bandeja/${doc.expected_document_id}?back=${encodeURIComponent(`/sedes/${institutionId}`)}`}
                                    className="font-medium text-brand-primary hover:underline"
                                  >
                                    Revisar
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

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
