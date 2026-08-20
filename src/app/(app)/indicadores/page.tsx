import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds, institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { REVIEW_STATUS_ORDER } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";
import type {
  AvanceSedeApartadoRow,
  ProductividadRevisorRow,
  PendienteSubsanacionRow,
} from "@/lib/types/indicadores-rows";

const SEDES_APARTADO_LIMIT = 50;
const PENDIENTES_LIMIT = 100;

interface Indicadores {
  documentosEsperados: number;
  documentosNoEsta: number;
  documentosUnicosRevisados: number;
  accionesTotales: number;
  porEstado: Record<ReviewStatus, number>;
  retrabajoCount: number;
  pendientesVencidos: number;
  avanceSedeApartado: AvanceSedeApartadoRow[];
  productividad: { revisor: string; acciones_totales: number; documentos_distintos: number }[];
  pendientes: PendienteSubsanacionRow[];
  error: string | null;
}

// Filtro de visibilidad por sede reutilizable en las vistas SQL (vw_*). `ids === null`
// significa sin restricción (administrador/consulta); en ese caso no se agrega ninguna
// cláusula. Ver src/lib/authz/visible-institutions.ts — no hay RLS que respalde esto.
function institutionFilter(ids: string[] | null, extra?: ReturnType<typeof sql>) {
  const parts: ReturnType<typeof sql>[] = [];
  if (ids !== null) parts.push(institutionIdInFilter(ids));
  if (extra) parts.push(extra);
  if (parts.length === 0) return sql``;
  return sql`where ${sql.join(parts, sql` and `)}`;
}

async function countRows(query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(query)) as unknown as { count: number }[];
  return Number(rows[0]?.count ?? 0);
}

async function loadIndicadores(ids: string[] | null): Promise<Indicadores> {
  try {
    const [
      documentosEsperados,
      documentosUnicosRevisados,
      accionesTotales,
      retrabajoCount,
      pendientesVencidos,
      ...estadoCounts
    ] = await Promise.all([
      countRows(sql`select count(*)::int as count from vw_estado_actual_documentos ${institutionFilter(ids)}`),
      countRows(
        sql`select count(*)::int as count from vw_estado_actual_documentos ${institutionFilter(ids, sql`numero_revisiones > 0`)}`
      ),
      countRows(sql`select count(*)::int as count from vw_historial_revisiones ${institutionFilter(ids)}`),
      countRows(sql`select count(*)::int as count from vw_retrabajo_documental ${institutionFilter(ids)}`),
      countRows(
        sql`select count(*)::int as count from vw_pendientes_subsanacion ${institutionFilter(ids, sql`vencido = true`)}`
      ),
      ...REVIEW_STATUS_ORDER.map((status) =>
        countRows(
          sql`select count(*)::int as count from vw_estado_actual_documentos ${institutionFilter(ids, sql`estado_actual = ${status}`)}`
        )
      ),
    ]);

    const [avanceRows, productividadRows, pendientesRows] = (await Promise.all([
      db.execute(
        sql`select * from vw_avance_sede_apartado ${institutionFilter(ids)} order by porcentaje_cumplimiento asc nulls last limit ${SEDES_APARTADO_LIMIT}`
      ),
      // vw_productividad_revisores está agregada por revisor, no por sede: no se filtra por
      // institución (ya está restringida por rol vía nav-config para acceder a /indicadores).
      db.execute(sql`select * from vw_productividad_revisores limit 5000`),
      db.execute(
        sql`select * from vw_pendientes_subsanacion ${institutionFilter(ids)} order by vencido desc, fecha_limite_subsanacion asc nulls last limit ${PENDIENTES_LIMIT}`
      ),
    ])) as unknown as [AvanceSedeApartadoRow[], ProductividadRevisorRow[], PendienteSubsanacionRow[]];

    const porEstado = REVIEW_STATUS_ORDER.reduce(
      (acc, status, idx) => {
        acc[status] = estadoCounts[idx] ?? 0;
        return acc;
      },
      {} as Record<ReviewStatus, number>,
    );

    const porRevisor = new Map<string, { revisor: string; acciones_totales: number; documentos_distintos: number }>();
    for (const row of productividadRows) {
      const key = row.reviewer_id;
      const current = porRevisor.get(key) ?? {
        revisor: row.revisor,
        acciones_totales: 0,
        documentos_distintos: 0,
      };
      current.acciones_totales += Number(row.acciones_totales);
      current.documentos_distintos += Number(row.documentos_distintos);
      porRevisor.set(key, current);
    }
    const productividad = Array.from(porRevisor.values()).sort(
      (a, b) => b.acciones_totales - a.acciones_totales,
    );

    return {
      documentosEsperados,
      documentosNoEsta: porEstado.no_esta ?? 0,
      documentosUnicosRevisados,
      accionesTotales,
      porEstado,
      retrabajoCount,
      pendientesVencidos,
      avanceSedeApartado: avanceRows,
      productividad,
      pendientes: pendientesRows,
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return {
      documentosEsperados: 0,
      documentosNoEsta: 0,
      documentosUnicosRevisados: 0,
      accionesTotales: 0,
      porEstado: REVIEW_STATUS_ORDER.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {} as Record<ReviewStatus, number>),
      retrabajoCount: 0,
      pendientesVencidos: 0,
      avanceSedeApartado: [],
      productividad: [],
      pendientes: [],
      error: message,
    };
  }
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-foreground-muted">{hint}</p> : null}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="text-sm text-foreground-muted">{description}</p> : null}
    </div>
  );
}

function cumplimientoColorVar(pct: number | null): string {
  if (pct === null) return "--color-status-pendiente";
  if (pct >= 80) return "--color-status-cumple";
  if (pct >= 50) return "--color-status-subsanar";
  return "--color-status-no-esta";
}

export default async function IndicadoresPage() {
  const profile = await getCurrentProfile();
  const ids = await visibleInstitutionIds(profile);
  const data = await loadIndicadores(ids);

  const tasaRetrabajo =
    data.documentosUnicosRevisados > 0
      ? ((data.retrabajoCount / data.documentosUnicosRevisados) * 100).toFixed(1)
      : "0.0";

  const sinDatos = !data.error && data.documentosEsperados === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Indicadores</h1>
        <p className="text-sm text-foreground-muted">
          Panel de control de la revisión documental, {profile.fullName.split(" ")[0]}. Vista según
          tu rol y sedes asignadas.
        </p>
      </div>

      {data.error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudieron cargar los indicadores todavía: la base de datos de RevisaSGD no está
          conectada en este entorno ({data.error}). Configura la variable{" "}
          <code>POSTGRES_URL</code> (o <code>DATABASE_URL</code>).
        </div>
      ) : sinDatos ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay datos importados. Ve a{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>{" "}
          para cargar la base de sedes y el catálogo documental.
        </div>
      ) : (
        <>
          {/* Resumen */}
          <section className="space-y-4">
            <SectionHeader title="Resumen" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Documentos esperados" value={data.documentosEsperados} />
              <StatCard
                label="Documentos faltantes"
                value={data.documentosNoEsta}
                hint="Estado: no está el documento"
              />
              <StatCard
                label="Documentos únicos revisados"
                value={data.documentosUnicosRevisados}
                hint="Al menos una revisión registrada"
              />
              <StatCard
                label="Acciones totales de revisión"
                value={data.accionesTotales}
                hint="Un documento puede tener varias acciones"
              />
            </div>
            <p className="text-xs text-foreground-muted">
              Nota: <span className="font-medium text-foreground">documentos únicos revisados</span>{" "}
              y <span className="font-medium text-foreground">acciones totales de revisión</span> son
              números distintos — un mismo documento puede ser revisado más de una vez (subsanación,
              reemplazo, etc.).
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Revisados 2+ veces (retrabajo)"
                value={data.retrabajoCount}
                hint={`Tasa de retrabajo: ${tasaRetrabajo}% de los documentos únicos revisados`}
              />
              <StatCard
                label="Pendientes por subsanar vencidos"
                value={data.pendientesVencidos}
                hint="Fecha límite de subsanación ya pasada"
              />
            </div>

          </section>

          {/* Cumplimiento por sede y apartado */}
          <section className="space-y-3">
            <SectionHeader
              title="Cumplimiento por sede y apartado"
              description={`Mostrando las ${SEDES_APARTADO_LIMIT} sedes/apartados con menor cumplimiento.`}
            />
            {data.avanceSedeApartado.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground-muted">
                No hay datos de avance todavía.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Sede</th>
                      <th className="px-4 py-2 font-medium">Apartado</th>
                      <th className="px-4 py-2 font-medium">Esperados</th>
                      <th className="px-4 py-2 font-medium">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.avanceSedeApartado.map((row, idx) => {
                      const pct = row.porcentaje_cumplimiento ?? 0;
                      const colorVar = cumplimientoColorVar(row.porcentaje_cumplimiento);
                      return (
                        <tr
                          key={`${row.institution_id}-${row.apartado}-${idx}`}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-2">
                            <p className="font-medium text-foreground">{row.sede}</p>
                            <p className="text-xs text-foreground-muted">{row.dane_sede}</p>
                          </td>
                          <td className="px-4 py-2 text-foreground">{row.apartado}</td>
                          <td className="px-4 py-2 text-foreground-muted">{row.documentos_esperados}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-muted">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, pct))}%`,
                                    backgroundColor: `var(${colorVar})`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-foreground-muted">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Productividad de revisores */}
          <section className="space-y-3">
            <SectionHeader
              title="Productividad de revisores"
              description="Acciones y documentos distintos revisados, acumulados por revisor."
            />
            {data.productividad.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground-muted">
                Todavía no hay revisiones registradas.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Revisor</th>
                      <th className="px-4 py-2 font-medium">Acciones totales</th>
                      <th className="px-4 py-2 font-medium">Documentos distintos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productividad.map((row) => (
                      <tr key={row.revisor} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{row.revisor}</td>
                        <td className="px-4 py-2 text-foreground-muted">{row.acciones_totales}</td>
                        <td className="px-4 py-2 text-foreground-muted">{row.documentos_distintos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pendientes por subsanar */}
          <section className="space-y-3">
            <SectionHeader
              title="Pendientes por subsanar"
              description={`Mostrando hasta ${PENDIENTES_LIMIT} pendientes, vencidos primero.`}
            />
            {data.pendientes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground-muted">
                No hay pendientes por subsanar.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Sede</th>
                      <th className="px-4 py-2 font-medium">Apartado / Evidencia</th>
                      <th className="px-4 py-2 font-medium">Revisor</th>
                      <th className="px-4 py-2 font-medium">Fecha límite</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendientes.map((row) => (
                      <tr
                        key={row.expected_document_id}
                        className={
                          row.vencido
                            ? "border-b border-border bg-status-no-esta/10 last:border-0"
                            : "border-b border-border last:border-0"
                        }
                      >
                        <td className="px-4 py-2 font-medium text-foreground">{row.sede}</td>
                        <td className="px-4 py-2 text-foreground-muted">
                          {row.apartado} · {row.evidencia}
                        </td>
                        <td className="px-4 py-2 text-foreground-muted">{row.revisor ?? "—"}</td>
                        <td className="px-4 py-2 text-foreground-muted">
                          {row.fecha_limite_subsanacion
                            ? new Date(row.fecha_limite_subsanacion).toLocaleDateString("es-CO")
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.vencido ? (
                            <span className="font-medium text-status-no-esta">Vencido</span>
                          ) : (
                            <span className="text-foreground-muted">En plazo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
