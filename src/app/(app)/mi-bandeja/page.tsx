import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { reviewQueueInstitutionIds, institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import { InlineDocReviewForm } from "@/components/inline-doc-review-form";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";
import type { ReviewStatus } from "@/lib/db/types";

const PAGE_SIZE = 15; // sedes por página, no documentos

interface SearchParams {
  estado?: string;
  q?: string;
  page?: string;
}

interface SedeGroupRow {
  institution_id: string;
  sede: string;
  dane_sede: string;
  linea: string;
  coordinador: string | null;
  mentor: string | null;
  total: number;
  cumplidos: number;
  total_count: number; // count(*) over() para paginación de sedes
}

export default async function MiBandejaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const estado = params.estado as ReviewStatus | undefined;
  const q = params.q?.trim();

  const ids = await reviewQueueInstitutionIds(profile);

  let sedeGroups: SedeGroupRow[] = [];
  let documentsBySede = new Map<string, EstadoActualRow[]>();
  let totalSedes = 0;
  let error: string | null = null;

  try {
    // 1) Sedes que coinciden con el filtro de búsqueda, con su % de avance real
    // (siempre sobre el total de la sede, sin importar el filtro de estado actual).
    const sedeConditions: ReturnType<typeof sql>[] = [];
    if (ids !== null) sedeConditions.push(institutionIdInFilter(ids));
    if (q) sedeConditions.push(sql`(sede ilike ${`%${q}%`} or dane_sede ilike ${`%${q}%`})`);
    const sedeWhere = sedeConditions.length > 0 ? sql`where ${sql.join(sedeConditions, sql` and `)}` : sql``;

    const sedeResult = await db.execute(sql`
      select
        institution_id, sede, dane_sede, linea, coordinador, mentor,
        count(*) as total,
        count(*) filter (where estado_actual = 'cumple') as cumplidos,
        count(*) over() as total_count
      from vw_estado_actual_documentos
      ${sedeWhere}
      group by institution_id, sede, dane_sede, linea, coordinador, mentor
      order by sede asc
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `);
    sedeGroups = (sedeResult as unknown as SedeGroupRow[]).map((r) => ({
      ...r,
      total: Number(r.total),
      cumplidos: Number(r.cumplidos),
      total_count: Number(r.total_count),
    }));
    totalSedes = sedeGroups[0]?.total_count ?? 0;

    // 2) Documentos de esas sedes (respetando el filtro de estado si hay uno), para
    // desplegar dentro de cada sede sin hacer una consulta por sede.
    const sedeIdsOnPage = sedeGroups.map((s) => s.institution_id);
    if (sedeIdsOnPage.length > 0) {
      const docConditions: ReturnType<typeof sql>[] = [institutionIdInFilter(sedeIdsOnPage)];
      if (estado) docConditions.push(sql`estado_actual = ${estado}`);

      const docsResult = await db.execute(sql`
        select * from vw_estado_actual_documentos
        where ${sql.join(docConditions, sql` and `)}
        order by apartado asc, evidencia asc
      `);
      const docs = docsResult as unknown as EstadoActualRow[];
      documentsBySede = new Map();
      for (const doc of docs) {
        const list = documentsBySede.get(doc.institution_id) ?? [];
        list.push(doc);
        documentsBySede.set(doc.institution_id, list);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Error desconocido";
  }

  function hrefWith(overrides: Partial<SearchParams>) {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides };
    if (merged.estado) next.set("estado", merged.estado);
    if (merged.q) next.set("q", merged.q);
    if (merged.page) next.set("page", merged.page);
    const qs = next.toString();
    return `/mi-bandeja${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Mi bandeja de revisión</h1>
        <p className="text-sm text-foreground-muted">
          {profile.role === "revisor"
            ? "Sedes que tienes asignadas, con su porcentaje de avance."
            : "Todas las sedes visibles según tu rol, con su porcentaje de avance."}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/mi-bandeja">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-foreground-muted">
            Sede
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nombre o código DANE…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label htmlFor="estado" className="mb-1 block text-xs font-medium text-foreground-muted">
            Estado (dentro de cada sede)
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estado ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">Todos</option>
            {REVIEW_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
        >
          Filtrar
        </button>
      </form>

      {error ? (
        <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
          No se pudo cargar la bandeja: la base de datos no está conectada todavía ({error}).
        </div>
      ) : sedeGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          No hay sedes que coincidan con este filtro. Si es la primera vez, importa sedes y
          catálogo, y genera los documentos esperados desde{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
        </div>
      ) : (
        <div className="space-y-3">
          {sedeGroups.map((sede) => {
            const porcentaje = sede.total > 0 ? Math.round((sede.cumplidos / sede.total) * 100) : 0;
            const docs = documentsBySede.get(sede.institution_id) ?? [];
            const barColor =
              porcentaje >= 80 ? "bg-status-cumple" : porcentaje >= 40 ? "bg-status-subsanar" : "bg-status-no-esta";

            return (
              <details key={sede.institution_id} className="group rounded-lg border border-border bg-surface shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">{sede.sede}</p>
                      <span className="shrink-0 text-xs text-foreground-muted">{sede.dane_sede}</span>
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {sede.linea} · Coordinador: {sede.coordinador ?? "—"} · Mentor: {sede.mentor ?? "—"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted">
                        <div className={`h-full ${barColor}`} style={{ width: `${porcentaje}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        {porcentaje}% ({sede.cumplidos}/{sede.total})
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/sedes/${sede.institution_id}`}
                    className="shrink-0 text-xs font-medium text-brand-primary hover:underline"
                  >
                    Ver sede →
                  </Link>
                </summary>

                <div className="border-t border-border">
                  {docs.length === 0 ? (
                    <p className="p-4 text-sm text-foreground-muted">
                      No hay documentos que coincidan con el filtro de estado en esta sede.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                          <tr>
                            <th className="px-4 py-2 font-medium">Apartado</th>
                            <th className="px-4 py-2 font-medium">Actor / Sesión</th>
                            <th className="px-4 py-2 font-medium">Evidencia</th>
                            <th className="px-4 py-2 font-medium">Estado</th>
                            <th className="px-4 py-2 font-medium">Fecha</th>
                            <th className="px-4 py-2 font-medium">Marcar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.map((row) => (
                            <tr key={row.expected_document_id} className="border-b border-border last:border-0">
                              <td className="px-4 py-2 text-foreground">{row.apartado}</td>
                              <td className="px-4 py-2 text-foreground-muted">
                                {row.actor ? `${row.actor}${row.numero_sesion ? ` · sesión ${row.numero_sesion}` : ""}` : "General"}
                              </td>
                              <td className="px-4 py-2 text-foreground">
                                {row.evidencia}
                                {row.ultima_observacion ? (
                                  <p className="mt-0.5 text-xs text-foreground-muted">
                                    {row.ultima_observacion}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-2">
                                <StatusBadge status={row.estado_actual} />
                              </td>
                              <td className="px-4 py-2 text-xs text-foreground-muted whitespace-nowrap">
                                {row.fecha_ultima_revision
                                  ? new Date(row.fecha_ultima_revision).toLocaleDateString("es-CO")
                                  : "—"}
                              </td>
                              <td className="px-4 py-2">
                                <InlineDocReviewForm
                                  expectedDocumentId={row.expected_document_id}
                                  currentStatus={row.estado_actual}
                                  returnTo={hrefWith({})}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {totalSedes > PAGE_SIZE ? (
        <div className="flex justify-between text-sm text-foreground-muted">
          <Link
            href={hrefWith({ page: String(page - 1) })}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"}
          >
            ← Anterior
          </Link>
          <span>
            Página {page} de {Math.ceil(totalSedes / PAGE_SIZE)} ({totalSedes} sedes)
          </span>
          <Link
            href={hrefWith({ page: String(page + 1) })}
            aria-disabled={page * PAGE_SIZE >= totalSedes}
            className={
              page * PAGE_SIZE >= totalSedes ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"
            }
          >
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
