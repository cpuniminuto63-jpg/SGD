import Link from "next/link";
import { and, asc, or, ilike, inArray, sql, eq, isNull, isNotNull, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments, reviewEvents } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_META, SEDE_OVERALL_STATUS_ORDER, type SedeOverallStatus } from "@/lib/sede-status";

/** Filtros de un solo clic desde las tarjetas del Resumen general (después de SGD) —
 * no son un SedeOverallStatus, son columnas directas de institutions. */
const PIPELINE_FILTERS = {
  sgd_aprobado: { label: "Aprobado por SGD", where: eq(institutions.sgdDecision, "aprobado") },
  sgd_rechazado: {
    label: "Rechazado por SGD (sin reenviar)",
    where: and(eq(institutions.sgdDecision, "rechazado"), isNull(institutions.sgdSecondReviewRequestedAt)),
  },
  sgd_segunda_revision: {
    label: "En segunda revisión de SGD",
    where: and(eq(institutions.sgdDecision, "rechazado"), isNotNull(institutions.sgdSecondReviewRequestedAt)),
  },
  sgd_rechazado_total: { label: "Rechazado por SGD", where: eq(institutions.sgdDecision, "rechazado") },
  eafit: { label: "Traslado EAFIT", where: isNotNull(institutions.traspasoEafitAt) },
  cpe: { label: "Entregado a CPE", where: isNotNull(institutions.entregadoCpeAt) },
  rerevision: { label: "Re-revisión pendiente (para revisores)", where: isNotNull(institutions.reReviewRequestedAt) },
} as const;
type PipelineFilterKey = keyof typeof PIPELINE_FILTERS;

const PAGE_SIZE = 25;

/** Fecha de la última revisión de documento registrada por sede (para la columna "Desde"). */
async function getLastActivityMap(institutionIds: string[]): Promise<Map<string, Date>> {
  if (institutionIds.length === 0) return new Map();
  const rows = await db
    .select({ institutionId: expectedDocuments.institutionId, lastActivity: sql<Date>`max(${reviewEvents.createdAt})` })
    .from(reviewEvents)
    .innerJoin(expectedDocuments, eq(expectedDocuments.id, reviewEvents.expectedDocumentId))
    .where(inArray(expectedDocuments.institutionId, institutionIds))
    .groupBy(expectedDocuments.institutionId);
  return new Map(rows.map((r) => [r.institutionId, r.lastActivity]));
}

interface SearchParams {
  q?: string;
  page?: string;
  estado?: string;
  pipeline?: string;
  mentor?: string;
}

export default async function SedesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const { q, page: pageParam, estado: estadoParam, pipeline: pipelineParam, mentor: mentorParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const estadoFiltro = SEDE_OVERALL_STATUS_ORDER.includes(estadoParam as SedeOverallStatus)
    ? (estadoParam as SedeOverallStatus)
    : null;
  const pipelineFiltro = pipelineParam && pipelineParam in PIPELINE_FILTERS ? (pipelineParam as PipelineFilterKey) : null;
  const mentorFiltro = mentorParam?.trim() || null;

  let rows: (typeof institutions.$inferSelect)[] = [];
  let estadoMap = new Map<string, SedeOverallStatus>();
  let lastActivityMap = new Map<string, Date>();
  let totalRows = 0;
  let error: string | null = null;

  try {
    const ids = await visibleInstitutionIds(profile);
    const search = q?.trim();

    // El estado general es derivado (no una columna), así que para filtrar por él hay
    // que calcularlo para TODO el alcance visible primero, y luego restringir a esos ids
    // — no se puede resolver en el WHERE de la consulta paginada de abajo.
    let estadoFilterIds: string[] | null = null;
    if (estadoFiltro) {
      const fullMap = await getSedeOverallStatusMap(ids);
      estadoFilterIds = [...fullMap.entries()].filter(([, s]) => s === estadoFiltro).map(([id]) => id);
    }

    const conditions = [
      ids !== null ? inArray(institutions.id, ids) : undefined,
      estadoFilterIds !== null ? inArray(institutions.id, estadoFilterIds) : undefined,
      pipelineFiltro ? PIPELINE_FILTERS[pipelineFiltro].where : undefined,
      mentorFiltro ? (mentorFiltro === "Sin mentor asignado" ? isNull(institutions.mentorName) : eq(institutions.mentorName, mentorFiltro)) : undefined,
      search
        ? or(
            ilike(institutions.sedeName, `%${search}%`),
            ilike(institutions.daneCode, `%${search}%`),
            ilike(institutions.sourceRowId, `%${search}%`)
          )
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    [rows, [{ n: totalRows }]] = await Promise.all([
      db
        .select()
        .from(institutions)
        .where(whereClause)
        .orderBy(asc(institutions.sedeName))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ n: count() }).from(institutions).where(whereClause),
    ]);

    const rowIds = rows.map((r) => r.id);
    [estadoMap, lastActivityMap] = await Promise.all([getSedeOverallStatusMap(rowIds), getLastActivityMap(rowIds)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  const filtroActivoLabel = [
    estadoFiltro ? SEDE_OVERALL_STATUS_META[estadoFiltro].label : null,
    pipelineFiltro ? PIPELINE_FILTERS[pipelineFiltro].label : null,
    mentorFiltro ? `Mentor: ${mentorFiltro}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Explorador de sedes</h1>
        <p className="text-sm text-foreground-muted">
          Consulta las 306 sedes y accede a los comentarios generales por apartado de cada una.
        </p>
      </div>

      {filtroActivoLabel ? (
        <div className="flex items-center gap-2 rounded-md border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-sm">
          <span className="text-foreground-muted">Filtro activo:</span>
          <span className="font-medium text-brand-primary">{filtroActivoLabel}</span>
          <Link href={`/sedes${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="ml-auto text-xs text-foreground-muted hover:underline">
            Quitar filtro ✕
          </Link>
        </div>
      ) : null}

      <form className="flex flex-wrap items-end gap-3" action="/sedes">
        {estadoFiltro ? <input type="hidden" name="estado" value={estadoFiltro} /> : null}
        {pipelineFiltro ? <input type="hidden" name="pipeline" value={pipelineFiltro} /> : null}
        {mentorFiltro ? <input type="hidden" name="mentor" value={mentorFiltro} /> : null}
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-foreground-muted">
            Buscar sede (nombre, DANE o ID)
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nombre, código DANE o ID…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
        >
          Buscar
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudo cargar el listado de sedes: la base de datos no está conectada todavía (
          {error}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          No hay sedes que coincidan con este filtro. Si es la primera vez, importa la base de
          sedes desde{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 font-medium">DANE</th>
                <th className="px-4 py-2 font-medium">Municipio</th>
                <th className="px-4 py-2 font-medium">Línea</th>
                <th className="px-4 py-2 font-medium">Coordinador</th>
                <th className="px-4 py-2 font-medium">Mentor</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Desde</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const estado = estadoMap.get(row.id) ?? "sin_revisar";
                const meta = SEDE_OVERALL_STATUS_META[estado];
                const lastActivity = lastActivityMap.get(row.id);
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{row.sedeName}</p>
                      <p className="text-xs text-foreground-muted">{row.institutionName}</p>
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">{row.daneCode}</td>
                    <td className="px-4 py-2 text-foreground-muted">
                      {row.municipality}, {row.department}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">{row.linea}</td>
                    <td className="px-4 py-2 text-foreground-muted">{row.coordinatorName ?? "—"}</td>
                    <td className="px-4 py-2 text-foreground-muted">{row.mentorName ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ color: `var(${meta.colorVar})`, backgroundColor: `color-mix(in srgb, var(${meta.colorVar}) 15%, transparent)` }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-foreground-muted whitespace-nowrap">
                      {lastActivity ? new Date(lastActivity).toLocaleDateString("es-CO") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/sedes/${row.id}`} className="font-medium text-brand-primary hover:underline">
                        Ver sede
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalRows > PAGE_SIZE ? (
        <div className="flex justify-between text-sm text-foreground-muted">
          <Link
            href={`/sedes?${new URLSearchParams({
              ...(q ? { q } : {}),
              ...(estadoFiltro ? { estado: estadoFiltro } : {}),
              ...(pipelineFiltro ? { pipeline: pipelineFiltro } : {}),
              ...(mentorFiltro ? { mentor: mentorFiltro } : {}),
              page: String(page - 1),
            })}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"}
          >
            ← Anterior
          </Link>
          <span>
            Página {page} de {Math.ceil(totalRows / PAGE_SIZE)} ({totalRows} sedes)
          </span>
          <Link
            href={`/sedes?${new URLSearchParams({
              ...(q ? { q } : {}),
              ...(estadoFiltro ? { estado: estadoFiltro } : {}),
              ...(pipelineFiltro ? { pipeline: pipelineFiltro } : {}),
              ...(mentorFiltro ? { mentor: mentorFiltro } : {}),
              page: String(page + 1),
            })}`}
            aria-disabled={page * PAGE_SIZE >= totalRows}
            className={
              page * PAGE_SIZE >= totalRows ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"
            }
          >
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
