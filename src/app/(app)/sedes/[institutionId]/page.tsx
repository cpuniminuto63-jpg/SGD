import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, documentSections } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";

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

export default async function SedeDetallePage({
  params,
}: {
  params: Promise<{ institutionId: string }>;
}) {
  const profile = await getCurrentProfile();
  const { institutionId } = await params;
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

  try {
    [sede] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  } catch (e) {
    institutionError = e instanceof Error ? e.message : "Error desconocido";
  }

  if (!institutionError && !sede) notFound();

  if (!institutionError) {
    try {
      const [avanceResult, docsResult, sectionRows] = await Promise.all([
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
      ]);
      avanceRows = avanceResult as unknown as AvanceApartadoRow[];
      documentRows = docsResult as unknown as EstadoActualRow[];
      sectionIdByName = new Map(sectionRows.map((s) => [s.name, s.id]));
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

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{sede.sedeName}</h1>
        <p className="text-sm text-foreground-muted">{sede.institutionName}</p>
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
                    <p className="font-medium text-foreground">{apartado.apartado}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted">
                        <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {pct}% ({apartado.documentos_cumple}/{apartado.documentos_esperados})
                      </span>
                    </div>
                  </div>
                  {canComment ? (
                    <span className="shrink-0 text-xs font-medium text-brand-primary underline-offset-2">
                      Ver documentos y comentarios
                    </span>
                  ) : null}
                </summary>

                <div className="space-y-4 border-t border-border p-4">
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
