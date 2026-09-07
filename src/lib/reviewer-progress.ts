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

// Redistribución masiva del 2026-09-04 (37 sedes que tenían Alexandra, María Elisa,
// Andrea y María Fernanda pasaron a otros 9 revisores) — a pedido del usuario, a la
// persona nueva no le toca "revisar de nuevo" una sede que ya tenía trabajo real
// hecho por el dueño anterior: cuenta como respondida desde el día 1 si esa sede ya
// tiene AL MENOS UN review_event de cualquiera. Las que de verdad estaban en cero
// (nunca nadie las tocó) siguen apareciendo como pendientes, como corresponde.
const REASSIGNMENT_EXCEPTION_DATE = "2026-09-04";

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
  trasladoEafit: number; // de sus sedes asignadas, cuántas ya pasaron "Traslado EAFIT"
  entregadoCpe: number; // de sus sedes asignadas, cuántas ya llegaron a "Entregado a CPE"
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
      assignedAt: reviewerAssignments.assignedAt,
      sedeName: institutions.sedeName,
      institutionName: institutions.institutionName,
      trasladoEafitAt: institutions.traspasoEafitAt,
      entregadoCpeAt: institutions.entregadoCpeAt,
    })
    .from(reviewerAssignments)
    .innerJoin(institutions, eq(institutions.id, reviewerAssignments.institutionId))
    .where(eq(reviewerAssignments.active, true));

  const allInstitutionIds = [...new Set(assignments.map((a) => a.institutionId))];
  const exceptionInstitutionIds = new Set(
    assignments
      .filter((a) => a.assignedAt.toISOString().slice(0, 10) === REASSIGNMENT_EXCEPTION_DATE)
      .map((a) => a.institutionId)
  );

  const [touchedRows, touchedByAnyoneRows, statusMaps] = await Promise.all([
    allInstitutionIds.length > 0
      ? db
          .selectDistinct({ reviewerId: reviewEvents.reviewerId, institutionId: expectedDocuments.institutionId })
          .from(reviewEvents)
          .innerJoin(expectedDocuments, eq(expectedDocuments.id, reviewEvents.expectedDocumentId))
          .where(inArray(expectedDocuments.institutionId, allInstitutionIds))
      : Promise.resolve([]),
    exceptionInstitutionIds.size > 0
      ? db
          .selectDistinct({ institutionId: expectedDocuments.institutionId })
          .from(reviewEvents)
          .innerJoin(expectedDocuments, eq(expectedDocuments.id, reviewEvents.expectedDocumentId))
          .where(inArray(expectedDocuments.institutionId, [...exceptionInstitutionIds]))
      : Promise.resolve([]),
    getSedeAndApartadoStatusMaps(allInstitutionIds.length > 0 ? allInstitutionIds : null),
  ]);
  const { overallStatusMap, apartadoStatusMap } = statusMaps;

  const touchedSet = new Set(touchedRows.map((r) => `${r.reviewerId}|${r.institutionId}`));
  const touchedByAnyoneSet = new Set(touchedByAnyoneRows.map((r) => r.institutionId));

  const assignmentsByReviewer = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByReviewer.get(a.profileId) ?? [];
    list.push(a);
    assignmentsByReviewer.set(a.profileId, list);
  }

  const institutionIdsByKey = [...apartadoStatusMap.keys()];

  return revisores.map((r) => {
    const mine = assignmentsByReviewer.get(r.id) ?? [];
    const pendientesSedes = mine.filter((a) => {
      if (touchedSet.has(`${r.id}|${a.institutionId}`)) return false;
      if (exceptionInstitutionIds.has(a.institutionId) && touchedByAnyoneSet.has(a.institutionId)) return false;
      return true;
    });
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
      trasladoEafit: mine.filter((a) => a.trasladoEafitAt).length,
      entregadoCpe: mine.filter((a) => a.entregadoCpeAt).length,
    };
  });
}
