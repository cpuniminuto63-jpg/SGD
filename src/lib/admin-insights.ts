import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions } from "@/lib/db/schema";
import { ALL_REVIEW_STATUSES } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";

/** Solo para administradores: vistas agregadas por mentor, departamento, envejecimiento
 * de "volver a campo" y una proyección simple de cierre. Todas parten del mismo cálculo
 * de estado de carpeta que ya usa el resto de la app (ver sede-status.ts) — aquí solo
 * se agrupa distinto (por mentor / por departamento) en vez de por sede o por apartado. */

export interface MentorBreakdown {
  mentorName: string;
  sedes: number;
  counts: Record<ReviewStatus, number>;
}

function emptyReviewStatusCounts(): Record<ReviewStatus, number> {
  return Object.fromEntries(ALL_REVIEW_STATUSES.map((s) => [s, 0])) as Record<ReviewStatus, number>;
}

function deriveApartadoStatus(statuses: ReviewStatus[]): ReviewStatus {
  if (statuses.length === 0) return "pendiente_revision";
  if (statuses.includes("volver_a_campo")) return "volver_a_campo";
  if (statuses.some((s) => s === "no_esta" || s === "pendiente_subsanar")) return "pendiente_subsanar";
  if (statuses.includes("pendiente_revision")) return "pendiente_revision";
  return "cumple";
}

interface DocRow {
  institution_id: string;
  section_id: string;
  required: boolean;
  estado: ReviewStatus;
}

/** Estado de cada carpeta de cada sede que ya tiene alguna revisión, agrupado por mentor:
 * cuántas carpetas de ese mentor están en cada estado (no solo un conteo de "problemas"),
 * para ver de un vistazo si un mentor tiene todo resuelto o sigue con pendientes. */
export async function getMentorBreakdown(): Promise<MentorBreakdown[]> {
  const [mentorByInstitution, docRowsResult] = await Promise.all([
    db
      .select({ id: institutions.id, mentorName: institutions.mentorName })
      .from(institutions)
      .then((rows) => new Map(rows.map((r) => [r.id, r.mentorName]))),
    db.execute(sql`
      with ultimo_evento as (
        select distinct on (expected_document_id) expected_document_id, status
        from review_events
        order by expected_document_id, created_at desc
      )
      select
        expected_documents.institution_id,
        expected_documents.section_id,
        expected_documents.required,
        coalesce(ultimo_evento.status, 'pendiente_revision') as estado
      from expected_documents
      left join ultimo_evento on ultimo_evento.expected_document_id = expected_documents.id
      where expected_documents.institution_id in (
        select distinct ed2.institution_id from expected_documents ed2
        join review_events re2 on re2.expected_document_id = ed2.id
      )
    `),
  ]);

  const docRows = docRowsResult as unknown as DocRow[];

  const obligatoriosPorCarpeta = new Map<string, ReviewStatus[]>();
  const todosPorCarpeta = new Map<string, ReviewStatus[]>();
  for (const row of docRows) {
    const key = `${row.institution_id}|${row.section_id}`;
    todosPorCarpeta.set(key, [...(todosPorCarpeta.get(key) ?? []), row.estado]);
    if (row.required) obligatoriosPorCarpeta.set(key, [...(obligatoriosPorCarpeta.get(key) ?? []), row.estado]);
  }

  const byMentor = new Map<string, { sedes: Set<string>; counts: Record<ReviewStatus, number> }>();
  for (const [key, todos] of todosPorCarpeta) {
    const [institutionId] = key.split("|");
    const mentorName = mentorByInstitution.get(institutionId) || "Sin mentor asignado";
    const obligatorios = obligatoriosPorCarpeta.get(key);
    const status = deriveApartadoStatus(obligatorios && obligatorios.length > 0 ? obligatorios : todos);

    const entry = byMentor.get(mentorName) ?? { sedes: new Set(), counts: emptyReviewStatusCounts() };
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
