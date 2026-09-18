import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions } from "@/lib/db/schema";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_ORDER, type SedeOverallStatus } from "@/lib/sede-status";

/** Solo para administradores: vistas agregadas por mentor, departamento, envejecimiento
 * de "volver a campo" y una proyección simple de cierre. Todas parten del mismo cálculo
 * de estado de carpeta que ya usa el resto de la app (ver sede-status.ts) — aquí solo
 * se agrupa distinto (por mentor / por departamento) en vez de por sede o por apartado. */

export interface MentorBreakdown {
  mentorName: string;
  sedes: number;
  counts: Record<SedeOverallStatus, number>;
}

function emptySedeOverallCounts(): Record<SedeOverallStatus, number> {
  return Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<SedeOverallStatus, number>;
}

/** Estado GENERAL de cada sede (el mismo de las tarjetas del Resumen general y del
 * Explorador de sedes — sin revisar / pendiente por subsanar / volver a campo /
 * documentos faltantes / trasladado a SGD), agrupado por mentor: cuántas de sus sedes
 * están en cada estado del flujo, no un conteo de apartados individuales (2026-09-18,
 * a pedido del usuario — antes mezclaba estados de documento/apartado que no reflejaban
 * el flujo real de seguimiento). */
export async function getMentorBreakdown(): Promise<MentorBreakdown[]> {
  const [mentorByInstitution, overallStatusMap] = await Promise.all([
    db
      .select({ id: institutions.id, mentorName: institutions.mentorName })
      .from(institutions)
      .then((rows) => new Map(rows.map((r) => [r.id, r.mentorName]))),
    getSedeOverallStatusMap(null),
  ]);

  const byMentor = new Map<string, { sedes: Set<string>; counts: Record<SedeOverallStatus, number> }>();
  for (const [institutionId, mentorNameRaw] of mentorByInstitution) {
    const mentorName = mentorNameRaw || "Sin mentor asignado";
    const status = overallStatusMap.get(institutionId) ?? "sin_revisar";

    const entry = byMentor.get(mentorName) ?? { sedes: new Set(), counts: emptySedeOverallCounts() };
    entry.sedes.add(institutionId);
    entry.counts[status] += 1;
    byMentor.set(mentorName, entry);
  }

  return [...byMentor.entries()]
    .map(([mentorName, v]) => ({ mentorName, sedes: v.sedes.size, counts: v.counts }))
    .sort((a, b) => b.counts.volver_a_campo + b.counts.pendiente_subsanar - (a.counts.volver_a_campo + a.counts.pendiente_subsanar));
}

export interface DepartmentAlert {
  department: string;
  volverACampo: number;
}

/** Departamentos con sedes en "Volver a campo" ahora mismo, para priorizar visitas. */
export async function getVolverACampoByDepartment(): Promise<DepartmentAlert[]> {
  const rows = (await db.execute(sql`
    with ultimo_evento as (
      select distinct on (expected_document_id) expected_document_id, status
      from review_events order by expected_document_id, created_at desc
    )
    select i.department, count(distinct i.id) as n
    from institutions i
    where exists (
      select 1 from expected_documents ed
      join ultimo_evento ue on ue.expected_document_id = ed.id
      where ed.institution_id = i.id and ue.status = 'volver_a_campo'
    )
    group by i.department
    order by n desc
  `)) as unknown as { department: string; n: number }[];
  return rows.map((r) => ({ department: r.department, volverACampo: Number(r.n) }));
}

export interface AgingAlert {
  institutionId: string;
  sedeName: string;
  since: Date;
  days: number;
}

/** Sedes en "Volver a campo" ordenadas por cuánto tiempo llevan así sin resolverse. */
export async function getVolverACampoAging(): Promise<AgingAlert[]> {
  const rows = (await db.execute(sql`
    with ultimo_evento as (
      select distinct on (expected_document_id) expected_document_id, status, created_at
      from review_events order by expected_document_id, created_at desc
    )
    select i.id as institution_id, i.sede_name, min(ue.created_at) as since
    from expected_documents ed
    join institutions i on i.id = ed.institution_id
    join ultimo_evento ue on ue.expected_document_id = ed.id
    where ue.status = 'volver_a_campo'
    group by i.id, i.sede_name
    order by since asc
  `)) as unknown as { institution_id: string; sede_name: string; since: Date }[];

  const now = Date.now();
  return rows.map((r) => ({
    institutionId: r.institution_id,
    sedeName: r.sede_name,
    since: r.since,
    days: Math.floor((now - new Date(r.since).getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

/** Proyección simple: sedes nuevas revisadas por día en promedio (últimos 7 días con
 * actividad) y cuántos días faltarían para las que aún no se han tocado. */
export async function getClosingProjection(): Promise<{ avgPerDay: number; remaining: number; days: number | null }> {
  const rows = (await db.execute(sql`
    select date(re.created_at) as dia, count(distinct ed.institution_id) as sedes
    from review_events re
    join expected_documents ed on ed.id = re.expected_document_id
    where re.created_at >= now() - interval '7 days'
    group by 1
  `)) as unknown as { dia: string; sedes: number }[];

  const totalTocadasUltimos7 = rows.reduce((s, r) => s + Number(r.sedes), 0);
  const diasConDatos = Math.max(rows.length, 1);
  const avgPerDay = totalTocadasUltimos7 / diasConDatos;

  const [{ total }] = (await db.execute(sql`select count(*)::int as total from institutions where active = true`)) as unknown as {
    total: number;
  }[];
  const [{ tocadas }] = (await db.execute(sql`
    select count(distinct ed.institution_id)::int as tocadas
    from expected_documents ed join review_events re on re.expected_document_id = ed.id
  `)) as unknown as { tocadas: number }[];

  const remaining = Math.max(total - tocadas, 0);
  const days = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;

  return { avgPerDay: Math.round(avgPerDay * 10) / 10, remaining, days };
}

export interface ConcurrencySnapshot {
  activeNow: number; // personas con un latido en los últimos 5 minutos
  peakToday: { hour: string; count: number } | null; // franja de 30 min con más gente distinta hoy
  hourlyToday: { hour: string; count: number }[];
}

/** Cuánta gente ha usado la app al tiempo hoy, agrupado en franjas de 30 minutos —
 * para decidir de qué tamaño necesita ser el servidor. Se basa en profile_pings,
 * que cada persona manda sola cada ~90s mientras tiene la pestaña abierta (ver
 * src/components/presence-ping.tsx). */
export async function getConcurrencySnapshot(): Promise<ConcurrencySnapshot> {
  const [[{ activeNow }], hourlyRows] = await Promise.all([
    db.execute(sql`
      select count(distinct profile_id)::int as "activeNow"
      from profile_pings
      where created_at >= now() - interval '5 minutes'
    `) as unknown as Promise<{ activeNow: number }[]>,
    db.execute(sql`
      select
        to_char(date_trunc('hour', created_at) + floor(extract(minute from created_at) / 30) * interval '30 minutes', 'HH24:MI') as franja,
        count(distinct profile_id)::int as n
      from profile_pings
      where created_at >= date_trunc('day', now())
      group by 1
      order by 1
    `) as unknown as Promise<{ franja: string; n: number }[]>,
  ]);

  const hourlyToday = hourlyRows.map((r) => ({ hour: r.franja, count: r.n }));
  const peakToday = hourlyToday.reduce<{ hour: string; count: number } | null>(
    (max, cur) => (!max || cur.count > max.count ? cur : max),
    null
  );

  return { activeNow, peakToday, hourlyToday };
}
