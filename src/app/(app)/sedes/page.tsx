import Link from "next/link";
import { and, asc, or, ilike, inArray, sql, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments, reviewEvents } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_META, type SedeOverallStatus } from "@/lib/sede-status";

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
}

export default async function SedesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const { q } = await searchParams;

  let rows: (typeof institutions.$inferSelect)[] = [];
  let estadoMap = new Map<string, SedeOverallStatus>();
  let lastActivityMap = new Map<string, Date>();
  let error: string | null = null;

  try {
    const ids = await visibleInstitutionIds(profile);
    const search = q?.trim();

    const conditions = [
      ids !== null ? inArray(institutions.id, ids) : undefined,
      search
        ? or(
            ilike(institutions.sedeName, `%${search}%`),
            ilike(institutions.daneCode, `%${search}%`),
            ilike(institutions.sourceRowId, `%${search}%`)
          )
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    rows = await db
      .select()
      .from(institutions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(institutions.sedeName));

    const rowIds = rows.map((r) => r.id);
    [estadoMap, lastActivityMap] = await Promise.all([getSedeOverallStatusMap(rowIds), getLastActivityMap(rowIds)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Explorador de sedes</h1>
        <p className="text-sm text-foreground-muted">
          Consulta las 306 sedes y accede a los comentarios generales por apartado de cada una.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/sedes">
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
    </div>
  );
}
