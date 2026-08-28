import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, reviewerAssignments, institutions, reviewEvents, expectedDocuments } from "@/lib/db/schema";
import { getSedeAndApartadoStatusMaps, SEDE_OVERALL_STATUS_ORDER, type SedeOverallStatus } from "@/lib/sede-status";

// Cuentas de prueba/utilitarias que no son revisores reales — se excluyen de los
// resúmenes de avance (2026-08-28, a pedido del usuario).
const PROFILE_IDS_EXCLUIDOS = [
  "c9970d17-eaed-4d12-b817-917d128bf800", // planeacion
  "f7725b35-50bf-4370-9604-475c57aa356d", // JONATHAN RODRIGUEZ (duplicado, correo no coincide)
  "4c9f850e-1aad-4f8b-a2ee-a928762a9ad7", // JONATHAN RODRIGUEZ (duplicado)
];

export interface ReviewerProgress {
  profileId: string;
  fullName: string;
  email: string;
  asignadas: number;
  respondidas: number; // sedes asignadas donde este revisor ya revisó al menos un documento
  pendientes: number; // asignadas - respondidas
  pendientesSedes: { institutionId: string; sedeName: string; institutionName: string }[];
  estadoCounts: Record<SedeOverallStatus, number>;
  carpetasAsignadas: number; // total de carpetas (apartados) entre todas sus sedes asignadas
  carpetasRevisadas: number; // de esas, cuántas ya tienen un veredicto (no están en "pendiente de revisión")
}

/**
 * Resumen por revisor: cuántas sedes tiene asignadas, en cuántas ya dejó al menos un
 * veredicto de apartado, cuáles le faltan por responder, y en qué estado general está
 * cada una de sus sedes asignadas (trasladado_sgd / volver_a_campo / etc.).
 */
export async function getReviewerProgressSummary(): Promise<ReviewerProgress[]> {
  const revisores = await db
    .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(and(eq(profiles.role, "revisor"), notInArray(profiles.id, PROFILE_IDS_EXCLUIDOS)))
    .orderBy(profiles.fullName);

  if (revisores.length === 0) return [];

  const assignments = await db
    .select({
      profileId: reviewerAssignments.profileId,
      institutionId: reviewerAssignments.institutionId,
      sedeName: institutions.sedeName,
      institutionName: institutions.institutionName,
    })
    .from(reviewerAssignments)
    .innerJoin(institutions, eq(institutions.id, reviewerAssignments.institutionId))
    .where(eq(reviewerAssignments.active, true));

  const allInstitutionIds = [...new Set(assignments.map((a) => a.institutionId))];

  const [touchedRows, statusMaps] = await Promise.all([
    allInstitutionIds.length > 0
      ? db
          .selectDistinct({ reviewerId: reviewEvents.reviewerId, institutionId: expectedDocuments.institutionId })
          .from(reviewEvents)
          .innerJoin(expectedDocuments, eq(expectedDocuments.id, reviewEvents.expectedDocumentId))
          .where(inArray(expectedDocuments.institutionId, allInstitutionIds))
      : Promise.resolve([]),
    getSedeAndApartadoStatusMaps(allInstitutionIds.length > 0 ? allInstitutionIds : null),
  ]);
  const { overallStatusMap, apartadoStatusMap } = statusMaps;

  const touchedSet = new Set(touchedRows.map((r) => `${r.reviewerId}|${r.institutionId}`));

  const assignmentsByReviewer = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByReviewer.get(a.profileId) ?? [];
    list.push(a);
    assignmentsByReviewer.set(a.profileId, list);
  }

  const institutionIdsByKey = [...apartadoStatusMap.keys()];

  return revisores.map((r) => {
    const mine = assignmentsByReviewer.get(r.id) ?? [];
    const pendientesSedes = mine.filter((a) => !touchedSet.has(`${r.id}|${a.institutionId}`));
    const estadoCounts = Object.fromEntries(SEDE_OVERALL_STATUS_ORDER.map((s) => [s, 0])) as Record<
      SedeOverallStatus,
      number
    >;
    for (const a of mine) {
      const status = overallStatusMap.get(a.institutionId) ?? "sin_revisar";
      estadoCounts[status] += 1;
    }

    const mineIds = new Set(mine.map((a) => a.institutionId));
    let carpetasAsignadas = 0;
    let carpetasRevisadas = 0;
    for (const key of institutionIdsByKey) {
      const [institutionId] = key.split("|");
      if (!mineIds.has(institutionId)) continue;
      carpetasAsignadas += 1;
      if (apartadoStatusMap.get(key) !== "pendiente_revision") carpetasRevisadas += 1;
    }

    return {
      profileId: r.id,
      fullName: r.fullName,
      email: r.email,
      asignadas: mine.length,
      respondidas: mine.length - pendientesSedes.length,
      pendientes: pendientesSedes.length,
      pendientesSedes: pendientesSedes.map((a) => ({
        institutionId: a.institutionId,
        sedeName: a.sedeName,
        institutionName: a.institutionName,
      })),
      estadoCounts,
      carpetasAsignadas,
      carpetasRevisadas,
    };
  });
}
