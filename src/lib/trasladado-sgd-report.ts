import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sectionReviews, institutions, reviewerAssignments, profiles } from "@/lib/db/schema";
import { getSedeOverallStatusMap } from "@/lib/sede-status";

export interface TrasladadoSgdRow {
  institutionId: string;
  daneCode: string;
  institutionName: string;
  sedeName: string;
  department: string;
  municipality: string;
  linea: string;
  revisor: string;
  fechaTraslado: Date;
}

/**
 * Sedes cuyo estado general derivado es "trasladado_sgd" (todos sus apartados en
 * Cumple), con la fecha en la que se alcanzó ese estado (el createdAt del último
 * veredicto de apartado que lo completó) y quién la tiene asignada.
 */
export async function getTrasladadoSgdReport(): Promise<TrasladadoSgdRow[]> {
  const overallStatusMap = await getSedeOverallStatusMap(null);
  const trasladadoIds = [...overallStatusMap.entries()].filter(([, status]) => status === "trasladado_sgd").map(([id]) => id);
  if (trasladadoIds.length === 0) return [];

  const [reviews, institutionRows, assignments] = await Promise.all([
    db
      .select({ institutionId: sectionReviews.institutionId, sectionId: sectionReviews.sectionId, createdAt: sectionReviews.createdAt })
      .from(sectionReviews)
      .where(inArray(sectionReviews.institutionId, trasladadoIds))
      .orderBy(desc(sectionReviews.createdAt)),
    db
      .select({
        id: institutions.id,
        daneCode: institutions.daneCode,
        institutionName: institutions.institutionName,
        sedeName: institutions.sedeName,
        department: institutions.department,
        municipality: institutions.municipality,
        linea: institutions.linea,
      })
      .from(institutions)
      .where(inArray(institutions.id, trasladadoIds)),
    db
      .select({ institutionId: reviewerAssignments.institutionId, reviewerName: profiles.fullName })
      .from(reviewerAssignments)
      .innerJoin(profiles, eq(profiles.id, reviewerAssignments.profileId))
      .where(inArray(reviewerAssignments.institutionId, trasladadoIds)),
  ]);

  const latestPerSection = new Map<string, Date>();
  for (const r of reviews) {
    const key = `${r.institutionId}|${r.sectionId}`;
    if (!latestPerSection.has(key)) latestPerSection.set(key, r.createdAt);
  }

  const maxCreatedAtByInstitution = new Map<string, Date>();
  for (const [key, createdAt] of latestPerSection) {
    const institutionId = key.split("|")[0];
    const current = maxCreatedAtByInstitution.get(institutionId);
    if (!current || createdAt > current) maxCreatedAtByInstitution.set(institutionId, createdAt);
  }

  const revisoresByInstitution = new Map<string, string[]>();
  for (const a of assignments) {
    const list = revisoresByInstitution.get(a.institutionId) ?? [];
    list.push(a.reviewerName);
    revisoresByInstitution.set(a.institutionId, list);
  }

  return institutionRows
    .map((inst) => ({
      institutionId: inst.id,
      daneCode: inst.daneCode,
      institutionName: inst.institutionName,
      sedeName: inst.sedeName,
      department: inst.department,
      municipality: inst.municipality,
      linea: inst.linea,
      revisor: (revisoresByInstitution.get(inst.id) ?? []).join(", ") || "Sin asignar",
      fechaTraslado: maxCreatedAtByInstitution.get(inst.id) ?? new Date(0),
    }))
    .sort((a, b) => b.fechaTraslado.getTime() - a.fechaTraslado.getTime());
}
