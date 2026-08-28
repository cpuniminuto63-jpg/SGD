import Link from "next/link";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds, institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import { getSedeAndApartadoStatusBreakdown, SEDE_OVERALL_STATUS_ORDER, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";
import { getReviewerProgressSummary } from "@/lib/reviewer-progress";
import { getReviewActivitySince, groupDailyByReviewer } from "@/lib/review-timeline";
import { SEGUIMIENTO_DESDE, todayInColombia, formatDay } from "@/lib/seguimiento-constants";
import {
  getMentorBreakdown,
  getVolverACampoByDepartment,
  getVolverACampoAging,
  getClosingProjection,
  getConcurrencySnapshot,
} from "@/lib/admin-insights";
import type { ReviewStatus } from "@/lib/db/types";

interface KpiCard {
  label: string;
  value: number;
}

async function loadKpis(ids: string[] | null): Promise<{ cards: KpiCard[]; error: string | null }> {
  try {
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
  const canSeeCoordinadores = profile.role === "administrador" || profile.role === "coordinador";
  const isAdmin = profile.role === "administrador";

  // Las secciones del dashboard no dependen entre sí — se cargan en paralelo en vez
  // de una detrás de otra, que era lo que hacía la página notablemente lenta.
  const [
    kpisResult,
    estadoResult,
    sedeBreakdownResult,
    reviewerProgress,
    activity,
    mentorBreakdown,
    deptAlerts,
    aging,
    projection,
    concurrency,
  ] = await Promise.all([
    loadKpis(ids),
    loadEstadoBreakdown(ids),
    getSedeAndApartadoStatusBreakdown(ids).then(
      (breakdown) => ({ breakdown, error: null as string | null }),
      (e: unknown) => ({
        breakdown: null,
        error: e instanceof Error ? e.message : "Error desconocido",
      })
    ),
    canSeeCoordinadores ? getReviewerProgressSummary() : Promise.resolve([]),
    canSeeCoordinadores ? getReviewActivitySince(SEGUIMIENTO_DESDE) : Promise.resolve([]),
    isAdmin ? getMentorBreakdown() : Promise.resolve([]),
    isAdmin ? getVolverACampoByDepartment() : Promise.resolve([]),
    isAdmin ? getVolverACampoAging() : Promise.resolve([]),
    isAdmin ? getClosingProjection() : Promise.resolve(null),
    isAdmin ? getConcurrencySnapshot() : Promise.resolve(null),
  ]);

  const { cards, error } = kpisResult;
  const { porEstado, error: estadoError } = estadoResult;

  const dailyByReviewer = groupDailyByReviewer(activity);
  const today = todayInColombia();
  const yesterday = new Date(new Date(today).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const revisadosHoyTotal = dailyByReviewer.filter((d) => d.day === today).reduce((sum, d) => sum + d.cambios, 0);

  const sedeBreakdownError = sedeBreakdownResult.error;
  const totalSedesUnicas = sedeBreakdownResult.breakdown?.totalSedesUnicas ?? 0;
  const sedeOverallCounts =
    sedeBreakdownResult.breakdown?.sedeOverallCounts ??
    (Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<
      (typeof SEDE_OVERALL_STATUS_ORDER)[number],
      number
    >);
  const apartadoBreakdown = sedeBreakdownResult.breakdown?.apartadoBreakdown ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Resumen general</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenido/a, {profile.fullName.split(" ")[0]}. Centro de control de la revisión
          documental de las 306 sedes.
        </p>
      </div>

      {isAdmin && aging.filter((a) => a.days >= 3).length > 0 ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-status-volver-campo/30 bg-status-volver-campo/10 p-3 text-sm font-medium text-status-volver-campo"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-status-volver-campo text-xs text-white">
            !
          </span>
          <span>
            {aging.filter((a) => a.days >= 3).length} sedes en &quot;Volver a campo&quot; llevan 3 días o más sin
            resolverse
            <span className="ml-1 font-normal text-foreground-muted">
              — la más antigua: {aging[0].sedeName}, desde hace {aging[0].days} días
            </span>
          </span>
        </div>
      ) : null}

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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-8">
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
                <div className="rounded-lg border border-border bg-surface-muted p-4 shadow-sm">
                  <p className="text-2xl font-semibold text-foreground">
                    {REVIEW_STATUS_ORDER.reduce((s, status) => s + (porEstado[status] ?? 0), 0)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-foreground-muted">Total</p>
                </div>
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                <div className="rounded-lg border border-border bg-surface-muted p-4 shadow-sm">
                  <p className="text-2xl font-semibold text-foreground">{totalSedesUnicas}</p>
                  <p className="mt-1 text-xs font-medium text-foreground-muted">Total</p>
                </div>
              </div>
            )}
          </div>

          {canSeeCoordinadores ? (
            <div>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Avance por coordinador (desde el {formatDay("2026-08-18")})
                </h2>
                <Link href="/admin/seguimiento" className="text-xs font-medium text-brand-primary hover:underline">
                  Ver calendario completo →
                </Link>
              </div>
              <p className="mb-3 text-xs text-foreground-muted">
                Revisados hoy entre todos: {revisadosHoyTotal}
              </p>
              {reviewerProgress.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground-muted">
                  No hay revisores con rol &quot;revisor&quot; creados todavía.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-4 py-2 font-medium">Coordinador</th>
                        <th className="px-4 py-2 font-medium">Sedes asignadas</th>
                        <th className="px-4 py-2 font-medium">Trasladadas a SGD</th>
                        <th className="px-4 py-2 font-medium">Pendientes por responder</th>
                        <th className="px-4 py-2 font-medium">Carpetas revisadas</th>
                        <th className="px-4 py-2 font-medium">Revisados hoy</th>
                        <th className="px-4 py-2 font-medium">Revisados ayer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewerProgress.map((r) => {
                        const hoy = dailyByReviewer.find((d) => d.day === today && d.reviewerId === r.profileId);
                        const ayer = dailyByReviewer.find((d) => d.day === yesterday && d.reviewerId === r.profileId);
                        return (
                          <tr key={r.profileId} className="border-b border-border last:border-0">
                            <td className="px-4 py-2 text-foreground">{r.fullName}</td>
                            <td className="px-4 py-2 text-foreground-muted">{r.asignadas}</td>
                            <td className="px-4 py-2 font-medium text-brand-secondary">{r.estadoCounts.trasladado_sgd}</td>
                            <td className="px-4 py-2">
                              <span className={r.pendientes > 0 ? "font-medium text-status-subsanar" : "text-foreground-muted"}>
                                {r.pendientes}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-foreground-muted">
                              {r.carpetasRevisadas} / {r.carpetasAsignadas}
                            </td>
                            <td className="px-4 py-2 text-foreground-muted">
                              {hoy ? `${hoy.cambios} docs (${hoy.sedesUnicas} sedes)` : "—"}
                            </td>
                            <td className="px-4 py-2 text-foreground-muted">
                              {ayer ? `${ayer.cambios} docs (${ayer.sedesUnicas} sedes)` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-surface-muted font-semibold text-foreground">
                      <tr>
                        <td className="px-4 py-2">Total ({reviewerProgress.length} revisores)</td>
                        <td className="px-4 py-2">{reviewerProgress.reduce((s, r) => s + r.asignadas, 0)}</td>
                        <td className="px-4 py-2">{reviewerProgress.reduce((s, r) => s + r.estadoCounts.trasladado_sgd, 0)}</td>
                        <td className="px-4 py-2">{reviewerProgress.reduce((s, r) => s + r.pendientes, 0)}</td>
                        <td className="px-4 py-2">
                          {reviewerProgress.reduce((s, r) => s + r.carpetasRevisadas, 0)} /{" "}
                          {reviewerProgress.reduce((s, r) => s + r.carpetasAsignadas, 0)}
                        </td>
                        <td className="px-4 py-2">
                          {dailyByReviewer.filter((d) => d.day === today).reduce((s, d) => s + d.cambios, 0)} docs
                        </td>
                        <td className="px-4 py-2">
                          {dailyByReviewer.filter((d) => d.day === yesterday).reduce((s, d) => s + d.cambios, 0)} docs
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {isAdmin && concurrency ? (
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Personas usando la app al tiempo</h2>
                <span className="text-xs text-foreground-muted">Para planear infraestructura, no para nada de negocio</span>
              </div>
              <div className="mb-3 flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-2xl font-semibold text-brand-secondary">{concurrency.activeNow}</p>
                  <p className="text-xs text-foreground-muted">Activas ahora (últimos 5 min)</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {concurrency.peakToday ? concurrency.peakToday.count : "—"}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    Pico de hoy{concurrency.peakToday ? ` (${concurrency.peakToday.hour})` : ""}
                  </p>
                </div>
              </div>
              {concurrency.hourlyToday.length > 0 ? (
                <div className="flex h-20 items-end gap-1">
                  {concurrency.hourlyToday.map((h) => (
                    <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}: ${h.count} personas`}>
                      <div
                        className="w-full rounded-t bg-brand-secondary"
                        style={{
                          height: `${Math.max((h.count / (concurrency.peakToday?.count || 1)) * 100, 6)}%`,
                        }}
                      />
                      <span className="text-[9px] text-foreground-muted">{h.hour}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">
                  Todavía no hay datos hoy — se van llenando solos mientras la gente usa la app.
                </p>
              )}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <h2 className="mb-1 text-sm font-semibold text-foreground">Volver a campo por departamento</h2>
                <p className="mb-3 text-xs text-foreground-muted">Dónde priorizar visitas presenciales.</p>
                {deptAlerts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">Ningún departamento con sedes en Volver a campo.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {deptAlerts.map((d) => (
                      <li key={d.department} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{d.department}</span>
                        <span className="font-semibold text-status-volver-campo">{d.volverACampo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <h2 className="mb-1 text-sm font-semibold text-foreground">Sedes en Volver a campo más antiguas</h2>
                <p className="mb-3 text-xs text-foreground-muted">Cuánto llevan esperando sin resolverse.</p>
                {aging.length === 0 ? (
                  <p className="text-sm text-foreground-muted">Ninguna sede en Volver a campo ahora mismo.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {aging.slice(0, 5).map((a) => (
                      <li key={a.institutionId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-foreground">{a.sedeName}</span>
                        <span className="shrink-0 font-semibold text-status-volver-campo">{a.days} días</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-4 text-center shadow-sm">
                <p className="text-2xl font-semibold text-brand-secondary">
                  {projection && projection.days !== null ? `~${projection.days} días` : "—"}
                </p>
                <p className="mt-1 text-xs font-medium text-foreground-muted">Proyección para cerrar las {306} sedes</p>
                <p className="mt-2 text-[11px] text-foreground-muted">
                  {projection
                    ? `Al ritmo de ${projection.avgPerDay} sedes/día en los últimos 7 días. Quedan ${projection.remaining} sin tocar.`
                    : "Sin datos suficientes todavía."}
                </p>
              </div>
            </div>
          ) : null}

          {isAdmin && mentorBreakdown.length > 0 ? (
            <div>
              <h2 className="mb-3 text-base font-semibold text-foreground">Estados por mentor</h2>
              <p className="mb-3 text-xs text-foreground-muted">
                Todas las carpetas de las sedes de cada mentor, por estado — para ver de un vistazo si un mentor
                tiene todo resuelto o le siguen quedando pendientes.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Mentor</th>
                      <th className="px-4 py-2 font-medium">Sedes</th>
                      {REVIEW_STATUS_ORDER.map((status) => (
                        <th key={status} className="px-3 py-2 font-medium">
                          {REVIEW_STATUS_META[status].label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mentorBreakdown.map((row) => (
                      <tr key={row.mentorName} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{row.mentorName}</td>
                        <td className="px-4 py-2 text-foreground-muted">{row.sedes}</td>
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
                  <tfoot className="border-t-2 border-border bg-surface-muted font-semibold text-foreground">
                    <tr>
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2">{mentorBreakdown.reduce((s, r) => s + r.sedes, 0)}</td>
                      {REVIEW_STATUS_ORDER.map((status) => (
                        <td key={status} className="px-3 py-2">
                          {mentorBreakdown.reduce((s, r) => s + r.counts[status], 0)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

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
                  <tfoot className="border-t-2 border-border bg-surface-muted font-semibold text-foreground">
                    <tr>
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2">{apartadoBreakdown.reduce((s, row) => s + row.totalSedes, 0)}</td>
                      {REVIEW_STATUS_ORDER.map((status) => (
                        <td key={status} className="px-3 py-2">
                          {apartadoBreakdown.reduce((s, row) => s + row.counts[status], 0)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
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
