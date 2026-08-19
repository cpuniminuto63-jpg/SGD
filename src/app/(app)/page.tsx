import Link from "next/link";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds, institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import { getSedeAndApartadoStatusBreakdown, SEDE_OVERALL_STATUS_ORDER, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";
import type { CurrentProfile } from "@/lib/auth/get-current-profile";
import type { ReviewStatus } from "@/lib/db/types";

interface KpiCard {
  label: string;
  value: number;
}

async function loadKpis(profile: CurrentProfile): Promise<{ cards: KpiCard[]; error: string | null }> {
  try {
    const ids = await visibleInstitutionIds(profile);

    const [{ count: sedes }] =
      ids === null
        ? await db.select({ count: sql<number>`count(*)` }).from(institutions)
        : await db
            .select({ count: sql<number>`count(*)` })
            .from(institutions)
            .where(inArray(institutions.id, ids));

    const [{ count: pendientes }] =
      ids === null
        ? await db.select({ count: sql<number>`count(*)` }).from(expectedDocuments)
        : await db
            .select({ count: sql<number>`count(*)` })
            .from(expectedDocuments)
            .where(inArray(expectedDocuments.institutionId, ids));

    return {
      cards: [
        { label: "Sedes activas", value: Number(sedes) ?? 0 },
        { label: "Documentos esperados", value: Number(pendientes) ?? 0 },
      ],
      error: null,
    };
  } catch (err) {
    return { cards: [], error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

async function loadEstadoBreakdown(
  ids: string[] | null
): Promise<{ porEstado: Record<ReviewStatus, number>; error: string | null }> {
  const porEstado = Object.fromEntries(REVIEW_STATUS_ORDER.map((s) => [s, 0])) as Record<ReviewStatus, number>;
  try {
    const whereClause = ids !== null ? sql`where ${institutionIdInFilter(ids)}` : sql``;
    const result = await db.execute(sql`
      select estado_actual, count(*)::int as count
      from vw_estado_actual_documentos
      ${whereClause}
      group by estado_actual
    `);
    for (const row of result as unknown as { estado_actual: ReviewStatus; count: number }[]) {
      porEstado[row.estado_actual] = row.count;
    }
    return { porEstado, error: null };
  } catch (err) {
    return { porEstado, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export default async function ResumenGeneralPage() {
  const profile = await getCurrentProfile();
  const ids = await visibleInstitutionIds(profile);
  const { cards, error } = await loadKpis(profile);
  const { porEstado, error: estadoError } = await loadEstadoBreakdown(ids);

  let sedeBreakdownError: string | null = null;
  let totalSedesUnicas = 0;
  let sedeOverallCounts = Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<
    (typeof SEDE_OVERALL_STATUS_ORDER)[number],
    number
  >;
  let apartadoBreakdown: Awaited<ReturnType<typeof getSedeAndApartadoStatusBreakdown>>["apartadoBreakdown"] = [];
  try {
    const breakdown = await getSedeAndApartadoStatusBreakdown(ids);
    totalSedesUnicas = breakdown.totalSedesUnicas;
    sedeOverallCounts = breakdown.sedeOverallCounts;
    apartadoBreakdown = breakdown.apartadoBreakdown;
  } catch (e) {
    sedeBreakdownError = e instanceof Error ? e.message : "Error desconocido";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Resumen general</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenido/a, {profile.fullName.split(" ")[0]}. Centro de control de la revisión
          documental de las 306 sedes.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudieron cargar los indicadores todavía: la base de datos de RevisaSGD no está
          conectada en este entorno ({error}). Configura la variable <code>POSTGRES_URL</code>.
        </div>
      ) : cards.every((c) => c.value === 0) ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay datos importados. Ve a{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>{" "}
          para cargar la base de sedes y el catálogo documental.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-foreground">Documentos por estado</h2>
            {estadoError ? (
              <div role="alert" className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
                No se pudo cargar el desglose por estado: {estadoError}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                {REVIEW_STATUS_ORDER.map((status) => {
                  const meta = REVIEW_STATUS_META[status];
                  return (
                    <Link
                      key={status}
                      href={`/mi-bandeja?estado=${status}`}
                      className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted"
                    >
                      <p
                        className="text-2xl font-semibold"
                        style={{ color: `var(${meta.colorVar})` }}
                      >
                        {porEstado[status] ?? 0}
                      </p>
                      <p className="mt-1 text-xs font-medium text-foreground-muted">{meta.label}</p>
                    </Link>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-foreground-muted">
              Haz clic en un estado para ver esos documentos filtrados en tu bandeja de revisión,
              con sus observaciones.
            </p>
          </div>

          <div>
            <h2 className="mb-1 text-base font-semibold text-foreground">
              Sedes únicas: {totalSedesUnicas}
            </h2>
            <p className="mb-3 text-xs text-foreground-muted">
              A diferencia del conteo de arriba (que cuenta documentos), esto cuenta cada sede una
              sola vez, según el veredicto vigente de sus apartados.
            </p>
            {sedeBreakdownError ? (
              <div role="alert" className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
                No se pudo cargar el desglose por sede: {sedeBreakdownError}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {SEDE_OVERALL_STATUS_ORDER.map((status) => {
                  const meta = SEDE_OVERALL_STATUS_META[status];
                  return (
                    <div key={status} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                      <p className="text-2xl font-semibold" style={{ color: `var(${meta.colorVar})` }}>
                        {sedeOverallCounts[status] ?? 0}
                      </p>
                      <p className="mt-1 text-xs font-medium text-foreground-muted">{meta.label}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {apartadoBreakdown.length > 0 ? (
            <div>
              <h2 className="mb-3 text-base font-semibold text-foreground">Estados por apartado (carpeta)</h2>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Apartado</th>
                      <th className="px-4 py-2 font-medium">Sedes</th>
                      {REVIEW_STATUS_ORDER.map((status) => (
                        <th key={status} className="px-3 py-2 font-medium">
                          {REVIEW_STATUS_META[status].label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apartadoBreakdown.map((row) => (
                      <tr key={row.sectionId} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{row.sectionName}</td>
                        <td className="px-4 py-2 text-foreground-muted">{row.totalSedes}</td>
                        {REVIEW_STATUS_ORDER.map((status) => (
                          <td
                            key={status}
                            className="px-3 py-2"
                            style={row.counts[status] > 0 ? { color: `var(${REVIEW_STATUS_META[status].colorVar})` } : undefined}
                          >
                            {row.counts[status] > 0 ? row.counts[status] : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-foreground-muted">
                Cuenta sedes por su último veredicto de apartado (ver &quot;Marcar veredicto de este
                apartado&quot; en la ficha de cada sede), no documentos individuales.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
