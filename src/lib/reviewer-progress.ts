import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, reviewerAssignments, institutions, sectionReviews } from "@/lib/db/schema";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_ORDER, type SedeOverallStatus } from "@/lib/sede-status";

export interface ReviewerProgress {
  profileId: string;
  fullName: string;
  email: string;
  asignadas: number;
  respondidas: number; // sedes asignadas donde este revisor dejó al menos un veredicto de apartado
  pendientes: number; // asignadas - respondidas
  pendientesSedes: { institutionId: string; sedeName: string; institutionName: string }[];
  estadoCounts: Record<SedeOverallStatus, number>;
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
    .where(eq(profiles.role, "revisor"))
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

  const [touchedRows, overallStatusMap] = await Promise.all([
    allInstitutionIds.length > 0
      ? db
          .selectDistinct({ reviewerId: sectionReviews.reviewerId, institutionId: sectionReviews.institutionId })
          .from(sectionReviews)
          .where(inArray(sectionReviews.institutionId, allInstitutionIds))
      : Promise.resolve([]),
    getSedeOverallStatusMap(allInstitutionIds.length > 0 ? allInstitutionIds : null),
  ]);

  const touchedSet = new Set(touchedRows.map((r) => `${r.reviewerId}|${r.institutionId}`));

  const assignmentsByReviewer = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByReviewer.get(a.profileId) ?? [];
    list.push(a);
    assignmentsByReviewer.set(a.profileId, list);
  }

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
    };
  });
}
