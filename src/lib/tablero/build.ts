// Arma el JSON que consume el Dashboard (src/components/dashboard-tablero.tsx)
// directamente desde la base de datos en vivo -- a diferencia del paquete original
// (que leía un Excel de corte diario), acá no hay "corte": siempre es el estado
// actual. Por eso prevCorte queda null y el tablero no muestra comparaciones "vs
// día anterior".
//
// institutionIds llega de visibleInstitutionIds(profile) (ver authz/visible-institutions.ts)
// -- así cada perfil ve exactamente las mismas sedes que ya ve en el resto de la app
// (Resumen general, Explorador de sedes, Mi bandeja), sin tener que duplicar esa lógica.
//
// IMPORTANTE: la app corre como un proceso Node persistente (no serverless), con un
// pool de conexiones a Neon de solo 5 (ver db/client.ts) COMPARTIDO por toda la app,
// no solo por esta pantalla. Por eso acá se usan nada más DOS consultas (no una por
// cada pieza de dato): una trae identidad + total de documentos por sede (institutions
// + expected_documents, sin pasar por la vista), la otra trae solo los documentos que
// NO están en "Cumple" (de los ~23 800 documentos normalmente solo ~4 800 están
// pendientes) -- y de esa misma segunda consulta se derivan en JS los conteos ps/nd/pr/vc
// por sede, sin una tercera consulta de agregación. Cargar el dashboard NUNCA debe poder
// dejar sin conexiones disponibles al resto de la app.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutionIdInFilter } from "@/lib/authz/visible-institutions";
import type { ReviewStatus } from "@/lib/db/types";

export type EstadoKey = "ps" | "nd" | "pr" | "vc";

const ESTADO_KEY: Partial<Record<ReviewStatus, EstadoKey>> = {
  pendiente_subsanar: "ps",
  no_esta: "nd",
  pendiente_revision: "pr",
  volver_a_campo: "vc",
};

export interface TableroSede {
  id: string;
  dane: string;
  sede: string;
  inst: string;
  dep: string;
  mun: string;
  lin: string;
  coo: string;
  men: string;
  rev: string;
  t: number;
  pr: number;
  nd: number;
  ps: number;
  vc: number;
  c: number;
}

/** [institutionId, idxDocumento, estado, idxTexto, idxComentadoPor, fechaISO | null] */
export type Comentario = [string, number, EstadoKey, number, number, string | null];

export interface TableroData {
  corte: string;
  prevCorte: string | null;
  prevLabel: string | null;
  start: string;
  rows: TableroSede[];
  cd: string[];
  ct: string[];
  cw: string[];
  com: Comentario[];
  prev: Record<string, [number, number, number, number, number]>;
  checks: { pendientesSedes: number; filasComentarios: number; ok: boolean };
}

interface IdentityRow {
  id: string;
  dane: string;
  sede: string;
  inst: string;
  dep: string;
  mun: string;
  lin: string;
  coo: string | null;
  men: string | null;
  rev: string | null;
  t: number;
}

interface PendingDocRow {
  institution_id: string;
  apartado: string;
  evidencia: string;
  estado_actual: ReviewStatus;
  ultima_observacion: string | null;
  ultimo_revisor: string | null;
  fecha_ultima_revision: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * institutionIds: `null` = sin restricción (administrador/consulta); `string[]` = solo
 * esas sedes -- ver visibleInstitutionIds().
 */
export async function buildTableroFromDb(institutionIds: string[] | null): Promise<TableroData> {
  if (institutionIds !== null && institutionIds.length === 0) {
    return {
      corte: todayIso(),
      prevCorte: null,
      prevLabel: null,
      start: todayIso(),
      rows: [],
      cd: [],
      ct: [],
      cw: [],
      com: [],
      prev: {},
      checks: { pendientesSedes: 0, filasComentarios: 0, ok: true },
    };
  }

  // institutionIdInFilter() arma "institution_id in (...)" a secas -- sirve para la
  // vista y para expected_documents (esas sí tienen una columna con ese nombre exacto
  // en el nivel donde se usa), pero NO para esta consulta de identidad, donde la tabla
  // va aliaseada "i" y su clave es "i.id".
  const idsFilterInst =
    institutionIds !== null
      ? sql`where i.id in (${sql.join(
          institutionIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
      : sql``;
  const idsFilterView = institutionIds !== null ? sql`and ${institutionIdInFilter(institutionIds)}` : sql``;

  const [identityRows, pendingDocs] = await Promise.all([
    db
      .execute(
        sql`
          select
            i.id as id,
            i.dane_code as dane,
            i.sede_name as sede,
            i.institution_name as inst,
            i.department as dep,
            i.municipality as mun,
            i.linea as lin,
            i.coordinator_name as coo,
            i.mentor_name as men,
            rv.rev as rev,
            coalesce(ed.t, 0)::int as t
          from institutions i
          left join (
            -- Agregado ANTES del join: una sede podría tener más de un revisor activo
            -- a la vez, y un join directo contra reviewer_assignments duplicaría esa
            -- fila de institutions una vez por cada revisor (inflando también "t").
            select ra.institution_id, string_agg(p.full_name, ', ' order by p.full_name) as rev
            from reviewer_assignments ra
            join profiles p on p.id = ra.profile_id
            where ra.active = true
            group by ra.institution_id
          ) rv on rv.institution_id = i.id
          left join (
            select institution_id, count(*) as t from expected_documents group by institution_id
          ) ed on ed.institution_id = i.id
          ${idsFilterInst}
        `
      )
      .then((r) => r as unknown as IdentityRow[]),
    db
      .execute(
        sql`
          select institution_id, apartado, evidencia, estado_actual, ultima_observacion,
                 ultimo_revisor, fecha_ultima_revision
          from vw_estado_actual_documentos
          where estado_actual in ('pendiente_subsanar', 'no_esta', 'pendiente_revision', 'volver_a_campo')
                ${idsFilterView}
        `
      )
      .then((r) => r as unknown as PendingDocRow[]),
  ]);

  const pendingCountByInstitution = new Map<string, { ps: number; nd: number; pr: number; vc: number }>();
  const cd: string[] = [];
  const ct: string[] = [];
  const cw: string[] = [];
  const md = new Map<string, number>();
  const mt = new Map<string, number>();
  const mw = new Map<string, number>();
  const idx = (arr: string[], map: Map<string, number>, k: string) => {
    let i = map.get(k);
    if (i === undefined) {
      i = arr.length;
      arr.push(k);
      map.set(k, i);
    }
    return i;
  };

  const com: Comentario[] = [];
  let start = todayIso();

  for (const d of pendingDocs) {
    const key = ESTADO_KEY[d.estado_actual];
    if (!key) continue; // no debería pasar (ya se filtró en SQL), pero por si acaso

    let counts = pendingCountByInstitution.get(d.institution_id);
    if (!counts) {
      counts = { ps: 0, nd: 0, pr: 0, vc: 0 };
      pendingCountByInstitution.set(d.institution_id, counts);
    }
    counts[key]++;

    const doc = `${d.apartado}|${d.evidencia}`;
    const tx = d.ultima_observacion?.trim() ?? "";
    const who = d.ultimo_revisor?.trim() || "(nunca revisado)";
    const fecha = d.fecha_ultima_revision ? new Date(d.fecha_ultima_revision).toISOString().slice(0, 16) : null;
    if (fecha && fecha.slice(0, 10) < start) start = fecha.slice(0, 10);
    com.push([d.institution_id, idx(cd, md, doc), key, idx(ct, mt, tx), idx(cw, mw, who), fecha]);
  }

  const rows: TableroSede[] = identityRows
    .map((r) => {
      const p = pendingCountByInstitution.get(r.id) ?? { ps: 0, nd: 0, pr: 0, vc: 0 };
      const t = r.t;
      return {
        id: r.id,
        dane: r.dane,
        sede: r.sede,
        inst: r.inst,
        dep: r.dep,
        mun: r.mun,
        lin: r.lin,
        coo: r.coo ?? "",
        men: r.men?.trim() || "Sin mentor asignado",
        rev: r.rev ?? "",
        t,
        ps: p.ps,
        nd: p.nd,
        pr: p.pr,
        vc: p.vc,
        c: t - p.ps - p.nd - p.pr - p.vc,
      };
    })
    .sort((a, b) => a.sede.localeCompare(b.sede, "es"));

  const pendientesSedes = rows.reduce((sum, r) => sum + (r.t - r.c), 0);

  return {
    corte: todayIso(),
    prevCorte: null,
    prevLabel: null,
    start,
    rows,
    cd,
    ct,
    cw,
    com,
    prev: {},
    checks: { pendientesSedes, filasComentarios: com.length, ok: pendientesSedes === com.length },
  };
}
