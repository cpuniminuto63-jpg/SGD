import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expectedDocuments, sectionReviews, documentSections } from "@/lib/db/schema";
import { REVIEW_STATUS_ORDER } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";

/**
 * Estado general de una sede, derivado del último veredicto manual por apartado
 * (section_reviews) — no del avance documento por documento. Ver
 * src/app/(app)/sedes/[institutionId]/page.tsx para la misma lógica aplicada a una
 * sola sede; este archivo la generaliza para poder contar "sedes únicas" en vez de
 * documentos.
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
  return Object.fromEntries(REVIEW_STATUS_ORDER.map((s) => [s, 0])) as Record<ReviewStatus, number>;
}

/** Clasifica una sede en un único estado general a partir de los veredictos de sus apartados. */
function deriveSedeOverallStatus(apartadoStatuses: ReviewStatus[]): SedeOverallStatus {
  if (apartadoStatuses.length > 0 && apartadoStatuses.every((s) => s === "cumple")) return "trasladado_sgd";
  if (apartadoStatuses.includes("volver_a_campo")) return "volver_a_campo";
  if (apartadoStatuses.includes("no_esta")) return "no_esta";
  if (apartadoStatuses.includes("pendiente_subsanar")) return "pendiente_subsanar";
  return "sin_revisar";
}

/**
 * institutionIds: `null` = sin restricción (administrador/consulta); `string[]` = solo
 * esas sedes (coordinador/revisor) — ver src/lib/authz/visible-institutions.ts.
 */
export async function getSedeAndApartadoStatusBreakdown(
  institutionIds: string[] | null
): Promise<SedeStatusBreakdown> {
  const apartadosQuery = db
    .selectDistinct({ institutionId: expectedDocuments.institutionId, sectionId: expectedDocuments.sectionId })
    .from(expectedDocuments);

  // La consulta de nombres de apartado no depende de nada más: se lanza en paralelo
  // con la de documentos esperados en vez de esperarla primero.
  const [apartadosEsperados, sections] = await Promise.all([
    institutionIds !== null ? apartadosQuery.where(inArray(expectedDocuments.institutionId, institutionIds)) : apartadosQuery,
    db.select({ id: documentSections.id, name: documentSections.name }).from(documentSections),
  ]);

  const allInstitutionIds = [...new Set(apartadosEsperados.map((r) => r.institutionId))];

  const reviewsQuery = db
    .select({
      institutionId: sectionReviews.institutionId,
      sectionId: sectionReviews.sectionId,
      status: sectionReviews.status,
    })
    .from(sectionReviews)
    .orderBy(desc(sectionReviews.createdAt));
  const allReviews =
    allInstitutionIds.length > 0 ? await reviewsQuery.where(inArray(sectionReviews.institutionId, allInstitutionIds)) : [];

  const latestBySedeSection = new Map<string, ReviewStatus>();
  for (const r of allReviews) {
    const key = `${r.institutionId}|${r.sectionId}`;
    if (!latestBySedeSection.has(key)) latestBySedeSection.set(key, r.status);
  }

  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));

  // Desglose por apartado: cuántas sedes tienen cada estado en ese apartado.
  const apartadoMap = new Map<string, ApartadoStatusBreakdown>();
  // Estados por sede: mapa institutionId -> lista de estados de sus apartados.
  const statusesByInstitution = new Map<string, ReviewStatus[]>();

  for (const { institutionId, sectionId } of apartadosEsperados) {
    const status = latestBySedeSection.get(`${institutionId}|${sectionId}`) ?? "pendiente_revision";

    const apartadoEntry = apartadoMap.get(sectionId) ?? {
      sectionId,
      sectionName: sectionNameById.get(sectionId) ?? sectionId,
      counts: emptyReviewStatusCounts(),
      totalSedes: 0,
    };
    apartadoEntry.counts[status] += 1;
    apartadoEntry.totalSedes += 1;
    apartadoMap.set(sectionId, apartadoEntry);

    const list = statusesByInstitution.get(institutionId) ?? [];
    list.push(status);
    statusesByInstitution.set(institutionId, list);
  }

  const sedeOverallCounts = Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<
    SedeOverallStatus,
    number
  >;
  for (const statuses of statusesByInstitution.values()) {
    sedeOverallCounts[deriveSedeOverallStatus(statuses)] += 1;
  }

  return {
    totalSedesUnicas: statusesByInstitution.size,
    sedeOverallCounts,
    apartadoBreakdown: [...apartadoMap.values()].sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
  };
}
