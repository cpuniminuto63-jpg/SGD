import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentSections } from "@/lib/db/schema";
import { institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { ALL_REVIEW_STATUSES } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";

/**
 * Estado general de una sede, derivado del estado de sus apartados (carpetas), que a
 * su vez ahora se calcula automáticamente a partir de los documentos individuales
 * obligatorios (ver deriveApartadoStatus más abajo) — ya no de un veredicto manual.
 */
export type SedeOverallStatus =
  | "trasladado_sgd"
  | "volver_a_campo"
  | "no_esta"
  | "pendiente_subsanar"
  | "sin_revisar";

export const SEDE_OVERALL_STATUS_ORDER: SedeOverallStatus[] = [
  "trasladado_sgd",
  "volver_a_campo",
  "no_esta",
  "pendiente_subsanar",
  "sin_revisar",
];

export const SEDE_OVERALL_STATUS_META: Record<SedeOverallStatus, { label: string; colorVar: string }> = {
  trasladado_sgd: { label: "Trasladado a revisión SGD", colorVar: "--color-brand-secondary" },
  volver_a_campo: { label: "Volver a campo", colorVar: "--color-status-volver-campo" },
  no_esta: { label: "Documentos faltantes", colorVar: "--color-status-no-esta" },
  pendiente_subsanar: { label: "Pendiente por subsanar", colorVar: "--color-status-subsanar" },
  sin_revisar: { label: "Sin revisar por apartado", colorVar: "--color-status-pendiente" },
};

export interface ApartadoStatusBreakdown {
  sectionId: string;
  sectionName: string;
  counts: Record<ReviewStatus, number>;
  totalSedes: number;
}

export interface SedeStatusBreakdown {
  totalSedesUnicas: number;
  sedeOverallCounts: Record<SedeOverallStatus, number>;
  apartadoBreakdown: ApartadoStatusBreakdown[];
}

function emptyReviewStatusCounts(): Record<ReviewStatus, number> {
  return Object.fromEntries(ALL_REVIEW_STATUSES.map((s) => [s, 0])) as Record<ReviewStatus, number>;
}

/**
 * Estado de una carpeta (apartado) a partir del estado de sus documentos individuales
 * (2026-08-20, a pedido del usuario — reemplaza el veredicto manual):
 *   1. Si algún documento obligatorio está "Volver a campo" -> la carpeta queda así.
 *   2. Si no, si alguno está "No hay documentación" o "Pendiente por subsanar" -> la
 *      carpeta queda "Pendiente por subsanar".
 *   3. Si no, si alguno sigue "Pendiente de revisión" (sin tocar) -> la carpeta queda así.
 *   4. Si todos los documentos obligatorios están en "Cumple" -> la carpeta = "Cumple".
 * Si el apartado no tiene NINGÚN documento obligatorio (ej. 06/11/12), se usa la misma
 * regla sobre TODOS sus documentos en vez de solo los obligatorios, para que no quede
 * "Cumple" de forma vacía sin que nadie haya revisado nada.
 */
function deriveApartadoStatus(statuses: ReviewStatus[]): ReviewStatus {
  if (statuses.length === 0) return "pendiente_revision";
  if (statuses.includes("volver_a_campo")) return "volver_a_campo";
  if (statuses.some((s) => s === "no_esta" || s === "pendiente_subsanar")) return "pendiente_subsanar";
  if (statuses.includes("pendiente_revision")) return "pendiente_revision";
  return "cumple"; // cumple, no_aplica y reemplazado (legado) se consideran resueltos
}

/** Clasifica una sede en un único estado general a partir de los estados de sus apartados. */
function deriveSedeOverallStatus(apartadoStatuses: ReviewStatus[]): SedeOverallStatus {
  if (apartadoStatuses.length > 0 && apartadoStatuses.every((s) => s === "cumple")) return "trasladado_sgd";
  if (apartadoStatuses.includes("volver_a_campo")) return "volver_a_campo";
  if (apartadoStatuses.includes("no_esta")) return "no_esta";
  if (apartadoStatuses.includes("pendiente_subsanar")) return "pendiente_subsanar";
  return "sin_revisar";
}

interface DocGroupRow {
  institution_id: string;
  section_id: string;
  required: boolean;
  estado: ReviewStatus;
}

interface StatusData {
  sectionNameById: Map<string, string>;
  apartadoStatusByKey: Map<string, ReviewStatus>;
  apartadoKeysByInstitution: Map<string, Set<string>>;
}

/**
 * institutionIds: `null` = sin restricción (administrador/consulta); `string[]` = solo
 * esas sedes (coordinador/revisor) — ver src/lib/authz/visible-institutions.ts.
 *
 * Compartido por getSedeAndApartadoStatusBreakdown y getSedeOverallStatusMap para no
 * repetir la consulta de estado por documento.
 */
async function computeStatusData(institutionIds: string[] | null): Promise<StatusData> {
  const whereClause = institutionIds !== null ? sql`where ${institutionIdInFilter(institutionIds)}` : sql``;

  const [sections, docRowsResult] = await Promise.all([
    db.select({ id: documentSections.id, name: documentSections.name }).from(documentSections),
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
      ${whereClause}
    `),
  ]);

  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
  const docRows = docRowsResult as unknown as DocGroupRow[];

  // Agrupa por (sede, apartado): lista de estados de sus documentos obligatorios, y
  // por separado, de TODOS sus documentos (para el caso sin obligatorios).
  const obligatoriosPorCarpeta = new Map<string, ReviewStatus[]>();
  const todosPorCarpeta = new Map<string, ReviewStatus[]>();
  const apartadoKeysByInstitution = new Map<string, Set<string>>();

  for (const row of docRows) {
    const key = `${row.institution_id}|${row.section_id}`;
    todosPorCarpeta.set(key, [...(todosPorCarpeta.get(key) ?? []), row.estado]);
    if (row.required) {
      obligatoriosPorCarpeta.set(key, [...(obligatoriosPorCarpeta.get(key) ?? []), row.estado]);
    }
    const set = apartadoKeysByInstitution.get(row.institution_id) ?? new Set<string>();
    set.add(key);
    apartadoKeysByInstitution.set(row.institution_id, set);
  }

  const apartadoStatusByKey = new Map<string, ReviewStatus>();
  for (const [key, todos] of todosPorCarpeta) {
    const obligatorios = obligatoriosPorCarpeta.get(key);
    apartadoStatusByKey.set(key, deriveApartadoStatus(obligatorios && obligatorios.length > 0 ? obligatorios : todos));
  }

  return { sectionNameById, apartadoStatusByKey, apartadoKeysByInstitution };
}

export async function getSedeAndApartadoStatusBreakdown(
  institutionIds: string[] | null
): Promise<SedeStatusBreakdown> {
  const { sectionNameById, apartadoStatusByKey, apartadoKeysByInstitution } = await computeStatusData(institutionIds);

  const apartadoMap = new Map<string, ApartadoStatusBreakdown>();
  const sedeOverallCounts = Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<
    SedeOverallStatus,
    number
  >;

  for (const [institutionId, keys] of apartadoKeysByInstitution) {
    const statuses: ReviewStatus[] = [];
    for (const key of keys) {
      const sectionId = key.split("|")[1];
      const status = apartadoStatusByKey.get(key) ?? "pendiente_revision";
      statuses.push(status);

      const entry = apartadoMap.get(sectionId) ?? {
        sectionId,
        sectionName: sectionNameById.get(sectionId) ?? sectionId,
        counts: emptyReviewStatusCounts(),
        totalSedes: 0,
      };
      entry.counts[status] += 1;
      entry.totalSedes += 1;
      apartadoMap.set(sectionId, entry);
    }
    sedeOverallCounts[deriveSedeOverallStatus(statuses)] += 1;
  }

  return {
    totalSedesUnicas: apartadoKeysByInstitution.size,
    sedeOverallCounts,
    apartadoBreakdown: [...apartadoMap.values()].sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
  };
}

/** Mapa institutionId -> estado general derivado, para agrupar por revisor/coordinador/día. */
export async function getSedeOverallStatusMap(institutionIds: string[] | null): Promise<Map<string, SedeOverallStatus>> {
  const { overallStatusMap } = await getSedeAndApartadoStatusMaps(institutionIds);
  return overallStatusMap;
}

/** Igual que llamar getSedeOverallStatusMap + getApartadoStatusMapForInstitutions por separado,
 * pero consultando la base una sola vez — útil cuando un mismo reporte necesita ambos mapas
 * (ej. informe-coordinador, que antes pagaba esta consulta pesada dos veces). */
export async function getSedeAndApartadoStatusMaps(
  institutionIds: string[] | null
): Promise<{ overallStatusMap: Map<string, SedeOverallStatus>; apartadoStatusMap: Map<string, ReviewStatus> }> {
  const { apartadoStatusByKey, apartadoKeysByInstitution } = await computeStatusData(institutionIds);
  const overallStatusMap = new Map<string, SedeOverallStatus>();
  for (const [institutionId, keys] of apartadoKeysByInstitution) {
    const statuses = [...keys].map((k) => apartadoStatusByKey.get(k) ?? "pendiente_revision");
    overallStatusMap.set(institutionId, deriveSedeOverallStatus(statuses));
  }
  return { overallStatusMap, apartadoStatusMap: apartadoStatusByKey };
}

/** Estado calculado de cada apartado de UNA sola sede (para la ficha de sede). */
export async function getApartadoStatusesForInstitution(institutionId: string): Promise<Map<string, ReviewStatus>> {
  const { apartadoStatusByKey } = await computeStatusData([institutionId]);
  const result = new Map<string, ReviewStatus>();
  for (const [key, status] of apartadoStatusByKey) {
    const [, sectionId] = key.split("|");
    result.set(sectionId, status);
  }
  return result;
}

/** Estado calculado de cada apartado de varias sedes, clave `${institutionId}|${sectionId}`. */
export async function getApartadoStatusMapForInstitutions(institutionIds: string[]): Promise<Map<string, ReviewStatus>> {
  const { apartadoStatusByKey } = await computeStatusData(institutionIds);
  return apartadoStatusByKey;
}
