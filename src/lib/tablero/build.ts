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
// Los conteos por sede se agregan EN SQL (una fila por sede, no una por documento) y el
// detalle de comentarios solo trae los documentos que NO están en "Cumple" -- de los
// ~23 800 documentos totales normalmente solo ~4 800 están pendientes. Traer las ~19 000
// filas "Cumple" de sobra (que el tablero ni siquiera muestra en el detalle) hacía la
// carga notablemente más lenta sin aportar nada.
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, reviewerAssignments, profiles } from "@/lib/db/schema";
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

interface CountRow {
  institution_id: string;
  t: number;
  ps: number;
  nd: number;
  pr: number;
  vc: number;
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

  const viewWhere = institutionIds !== null ? sql`where ${institutionIdInFilter(institutionIds)}` : sql``;

  const instSelect = db
    .select({
      id: institutions.id,
      dane: institutions.daneCode,
      sede: institutions.sedeName,
      inst: institutions.institutionName,
      dep: institutions.department,
      mun: institutions.municipality,
      lin: institutions.linea,
      coo: institutions.coordinatorName,
      men: institutions.mentorName,
    })
    .from(institutions);

  const [instRows, countRows, pendingDocs, reviewerRows] = await Promise.all([
    institutionIds !== null ? instSelect.where(inArray(institutions.id, institutionIds)) : instSelect,
    db
      .execute(
        sql`
          select institution_id,
                 count(*)::int as t,
                 count(*) filter (where estado_actual = 'pendiente_subsanar')::int as ps,
                 count(*) filter (where estado_actual = 'no_esta')::int as nd,
                 count(*) filter (where estado_actual = 'pendiente_revision')::int as pr,
                 count(*) filter (where estado_actual = 'volver_a_campo')::int as vc
          from vw_estado_actual_documentos
          ${viewWhere}
          group by institution_id
        `
      )
      .then((r) => r as unknown as CountRow[]),
    db
      .execute(
        sql`
          select institution_id, apartado, evidencia, estado_actual, ultima_observacion,
                 ultimo_revisor, fecha_ultima_revision
          from vw_estado_actual_documentos
          where estado_actual in ('pendiente_subsanar', 'no_esta', 'pendiente_revision', 'volver_a_campo')
                ${institutionIds !== null ? sql`and ${institutionIdInFilter(institutionIds)}` : sql``}
        `
      )
      .then((r) => r as unknown as PendingDocRow[]),
    db
      .select({ institutionId: reviewerAssignments.institutionId, reviewerName: profiles.fullName })
      .from(reviewerAssignments)
      .innerJoin(profiles, eq(profiles.id, reviewerAssignments.profileId))
      .where(eq(reviewerAssignments.active, true)),
  ]);

  const reviewerByInstitution = new Map(reviewerRows.map((r) => [r.institutionId, r.reviewerName]));
  const countByInstitution = new Map(countRows.map((r) => [r.institution_id, r]));

  const rows: TableroSede[] = instRows
    .map((r) => {
      const c = countByInstitution.get(r.id);
      const t = c?.t ?? 0;
      const ps = c?.ps ?? 0;
      const nd = c?.nd ?? 0;
      const pr = c?.pr ?? 0;
      const vc = c?.vc ?? 0;
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
        rev: reviewerByInstitution.get(r.id) ?? "",
        t,
        ps,
        nd,
        pr,
        vc,
        c: t - ps - nd - pr - vc,
      };
    })
    .sort((a, b) => a.sede.localeCompare(b.sede, "es"));

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
    const doc = `${d.apartado}|${d.evidencia}`;
    const tx = d.ultima_observacion?.trim() ?? "";
    const who = d.ultimo_revisor?.trim() || "(nunca revisado)";
    const fecha = d.fecha_ultima_revision ? new Date(d.fecha_ultima_revision).toISOString().slice(0, 16) : null;
    if (fecha && fecha.slice(0, 10) < start) start = fecha.slice(0, 10);
    com.push([d.institution_id, idx(cd, md, doc), key, idx(ct, mt, tx), idx(cw, mw, who), fecha]);
  }

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
