// Arma el JSON que consume el Tablero (public/dashboard/tablero.html) directamente
// desde la base de datos en vivo -- a diferencia del paquete original (que leía un
// Excel de corte diario), acá no hay "corte": siempre es el estado actual. Por eso
// prevCorte queda null y el tablero no muestra comparaciones "vs día anterior".
//
// institutionIds llega de visibleInstitutionIds(profile) (ver authz/visible-institutions.ts)
// -- así cada perfil ve exactamente las mismas sedes que ya ve en el resto de la app
// (Resumen general, Explorador de sedes, Mi bandeja), sin tener que duplicar esa lógica.
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewerAssignments, profiles } from "@/lib/db/schema";
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

/** [dane, idxDocumento, estado, idxTexto, idxComentadoPor, fechaISO | null] */
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

interface EstadoActualDocRow {
  institution_id: string;
  dane_sede: string;
  sede: string;
  institucion: string;
  departamento: string;
  municipio: string;
  linea: string;
  coordinador: string | null;
  mentor: string | null;
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
  const whereClause = institutionIds !== null ? sql`where ${institutionIdInFilter(institutionIds)}` : sql``;

  const [docs, reviewerRows] = await Promise.all([
    db
      .execute(
        sql`
          select institution_id, dane_sede, sede, institucion, departamento, municipio, linea,
                 coordinador, mentor, apartado, evidencia, estado_actual, ultima_observacion,
                 ultimo_revisor, fecha_ultima_revision
          from vw_estado_actual_documentos
          ${whereClause}
        `
      )
      .then((r) => r as unknown as EstadoActualDocRow[]),
    db
      .select({ institutionId: reviewerAssignments.institutionId, reviewerName: profiles.fullName })
      .from(reviewerAssignments)
      .innerJoin(profiles, eq(profiles.id, reviewerAssignments.profileId))
      .where(eq(reviewerAssignments.active, true)),
  ]);

  const reviewerByInstitution = new Map(reviewerRows.map((r) => [r.institutionId, r.reviewerName]));

  const sedeMap = new Map<string, TableroSede>();
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

  for (const d of docs) {
    let s = sedeMap.get(d.institution_id);
    if (!s) {
      s = {
        dane: d.dane_sede,
        sede: d.sede,
        inst: d.institucion,
        dep: d.departamento,
        mun: d.municipio,
        lin: d.linea,
        coo: d.coordinador ?? "",
        men: d.mentor?.trim() || "Sin mentor asignado",
        rev: reviewerByInstitution.get(d.institution_id) ?? "",
        t: 0,
        pr: 0,
        nd: 0,
        ps: 0,
        vc: 0,
        c: 0,
      };
      sedeMap.set(d.institution_id, s);
    }
    s.t++;
    const key = ESTADO_KEY[d.estado_actual];
    if (!key) {
      // cumple, no_aplica y reemplazado (legado) se consideran resueltos -- igual
      // regla que deriveApartadoStatus en sede-status.ts.
      s.c++;
      continue;
    }
    s[key]++;
    const doc = `${d.apartado}|${d.evidencia}`;
    const tx = d.ultima_observacion?.trim() ?? "";
    const who = d.ultimo_revisor?.trim() || "(nunca revisado)";
    const fecha = d.fecha_ultima_revision ? new Date(d.fecha_ultima_revision).toISOString().slice(0, 16) : null;
    if (fecha && fecha.slice(0, 10) < start) start = fecha.slice(0, 10);
    com.push([d.dane_sede, idx(cd, md, doc), key, idx(ct, mt, tx), idx(cw, mw, who), fecha]);
  }

  const rows = [...sedeMap.values()].sort((a, b) => a.sede.localeCompare(b.sede, "es"));
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
