import { requireRole } from "@/lib/auth/require-role";
import { getReviewerProgressSummary } from "@/lib/reviewer-progress";
import { getSedeAndApartadoStatusBreakdown, SEDE_OVERALL_STATUS_ORDER, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";
import { getReviewActivitySince, groupDailyByReviewer, groupDailyTotals } from "@/lib/review-timeline";
import { SEGUIMIENTO_DESDE, formatDay } from "@/lib/seguimiento-constants";

export const dynamic = "force-dynamic";

export default async function SeguimientoPage() {
  await requireRole("administrador");

  const [reviewerProgress, snapshot, activity] = await Promise.all([
    getReviewerProgressSummary(),
    getSedeAndApartadoStatusBreakdown(null),
    getReviewActivitySince(SEGUIMIENTO_DESDE),
  ]);

  const dailyByReviewer = groupDailyByReviewer(activity);
  const dailyTotals = groupDailyTotals(activity);

  const reviewerNames = [...new Set(dailyByReviewer.map((r) => r.reviewerName))].sort((a, b) => a.localeCompare(b));
  const days = [...new Set(dailyByReviewer.map((r) => r.day))].sort();

  const countLookup = new Map(dailyByReviewer.map((r) => [`${r.day}|${r.reviewerName}`, r.cambios]));

  const totalAsignadas = reviewerProgress.reduce((sum, r) => sum + r.asignadas, 0);
  const totalRespondidas = reviewerProgress.reduce((sum, r) => sum + r.respondidas, 0);
  const totalPendientes = reviewerProgress.reduce((sum, r) => sum + r.pendientes, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Seguimiento y calendario de revisión</h1>
        <p className="text-sm text-foreground-muted">
          Control de avance por revisor desde el {formatDay("2026-08-18")}, estado actual de todas las
          sedes en tiempo real, y registro diario de cambios de estado con quién los hizo.
        </p>
      </div>

      {/* 1. Resumen por revisor: asignadas vs respondidas vs pendientes */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground">Avance por revisor</h2>
          <p className="text-sm text-foreground-muted">
            Total: {totalAsignadas} asignadas · {totalRespondidas} con al menos una revisión · {totalPendientes}{" "}
            sin ninguna revisión todavía
          </p>
        </div>

        {reviewerProgress.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
            No hay revisores con rol &quot;revisor&quot; creados todavía.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Revisor</th>
                  <th className="px-4 py-2 font-medium">Asignadas</th>
                  <th className="px-4 py-2 font-medium">Respondidas</th>
                  <th className="px-4 py-2 font-medium">Pendientes por responder</th>
                  <th className="px-4 py-2 font-medium">Trasladado a SGD</th>
                  <th className="px-4 py-2 font-medium">Volver a campo</th>
                  <th className="px-4 py-2 font-medium">Pendiente subsanar</th>
                  <th className="px-4 py-2 font-medium">Sin revisar</th>
                </tr>
              </thead>
              <tbody>
                {reviewerProgress.map((r) => (
                  <tr key={r.profileId} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-2 text-foreground">
                      {r.fullName}
                      <p className="text-xs text-foreground-muted">{r.email}</p>
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">{r.asignadas}</td>
                    <td className="px-4 py-2 text-status-cumple">{r.respondidas}</td>
                    <td className="px-4 py-2">
                      {r.pendientes > 0 ? (
                        <details>
                          <summary className="cursor-pointer font-medium text-status-subsanar">{r.pendientes}</summary>
                          <ul className="mt-1 list-inside list-disc text-xs text-foreground-muted">
                            {r.pendientesSedes.map((s) => (
                              <li key={s.institutionId}>{s.sedeName} — {s.institutionName}</li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="text-foreground-muted">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-foreground-muted">{r.estadoCounts.trasladado_sgd}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.estadoCounts.volver_a_campo}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.estadoCounts.pendiente_subsanar}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.estadoCounts.sin_revisar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Vista rápida: en qué estado están todas las sedes ahora mismo */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Si te paras a mirar ahora — estado actual de las {snapshot.totalSedesUnicas} sedes
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SEDE_OVERALL_STATUS_ORDER.map((status) => (
            <div key={status} className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-2xl font-semibold text-foreground">{snapshot.sedeOverallCounts[status]}</p>
              <p className="text-xs text-foreground-muted">{SEDE_OVERALL_STATUS_META[status].label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Calendario: matriz día x revisor */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Calendario de actividad por revisor</h2>
        <p className="text-sm text-foreground-muted">
          Número de cambios de estado registrados cada día por cada revisor, desde el 18 de agosto.
        </p>
        {days.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
            Todavía no hay veredictos de apartado registrados desde el 18 de agosto.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="sticky left-0 bg-surface-muted px-4 py-2 font-medium">Fecha</th>
                  {reviewerNames.map((name) => (
                    <th key={name} className="px-3 py-2 font-medium whitespace-nowrap">
                      {name}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Total del día</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const total = dailyTotals.find((t) => t.day === day);
                  return (
                    <tr key={day} className="border-b border-border last:border-0">
                      <td className="sticky left-0 bg-surface px-4 py-2 text-foreground-muted">{formatDay(day)}</td>
                      {reviewerNames.map((name) => (
                        <td key={name} className="px-3 py-2 text-center text-foreground-muted">
                          {countLookup.get(`${day}|${name}`) ?? "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-medium text-foreground">
                        {total?.cambios ?? 0} ({total?.sedesUnicas ?? 0} sedes)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Detalle reciente: quién cambió qué y cuándo */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Detalle de cambios recientes</h2>
        <p className="text-sm text-foreground-muted">Últimos {Math.min(activity.length, 200)} cambios de estado registrados.</p>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Revisor</th>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 font-medium">Apartado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {activity.slice(0, 200).map((e, i) => (
                <tr key={i} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2 text-foreground-muted whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-2 text-foreground">{e.reviewerName}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {e.sedeName}
                    <p className="text-xs">{e.institutionName}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{e.sectionName}</td>
                  <td className="px-4 py-2 text-foreground-muted">{e.status}</td>
                  <td className="px-4 py-2 text-xs text-foreground-muted">{e.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Recomendación */}
      <section className="rounded-lg border border-border bg-surface-muted p-4">
        <h2 className="text-sm font-semibold text-foreground">Cómo llevar este seguimiento de forma más efectiva</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground-muted">
          <li>
            Usa esta página como tu &quot;parada diaria&quot;: la tabla de avance por revisor te dice de un
            vistazo a quién le faltan sedes por responder, sin tener que preguntarle a cada uno.
          </li>
          <li>
            El calendario te muestra si alguien lleva varios días sin actividad — eso suele avisar
            antes que esperar a la fecha límite.
          </li>
          <li>
            Descarga el Excel de &quot;Trasladado a SGD&quot; y el de &quot;Cambios por día&quot; (en
            Administración → Exportación de resultados) cuando necesites compartir avance fuera de la
            app; ambos quedan con fecha y quién generó el reporte.
          </li>
          <li>
            Todo el historial es inmutable — cada veredicto queda guardado con quién y cuándo lo hizo,
            así que este resumen y el detalle de abajo son siempre reconstruibles y auditables.
          </li>
        </ul>
      </section>
    </div>
  );
}
