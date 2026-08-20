import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewEvents, expectedDocuments, institutions, reviewerAssignments, profiles } from "@/lib/db/schema";
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
 * Cumple, calculado automáticamente desde los documentos obligatorios — ver
 * src/lib/sede-status.ts), con la fecha del último documento obligatorio revisado
 * (aproximación del momento en que se completó el traslado) y quién la tiene asignada.
 */
export async function getTrasladadoSgdReport(): Promise<TrasladadoSgdRow[]> {
  const overallStatusMap = await getSedeOverallStatusMap(null);
  const trasladadoIds = [...overallStatusMap.entries()].filter(([, status]) => status === "trasladado_sgd").map(([id]) => id);
  if (trasladadoIds.length === 0) return [];

  const [reviews, institutionRows, assignments] = await Promise.all([
    db
      .select({ institutionId: expectedDocuments.institutionId, createdAt: reviewEvents.createdAt })
      .from(reviewEvents)
      .innerJoin(expectedDocuments, eq(expectedDocuments.id, reviewEvents.expectedDocumentId))
      .where(inArray(expectedDocuments.institutionId, trasladadoIds))
      .orderBy(desc(reviewEvents.createdAt)),
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

  // reviews viene desc por fecha: la primera vez que vemos una institución es su
  // revisión más reciente (aproximación de cuándo terminó de quedar todo en Cumple).
  const maxCreatedAtByInstitution = new Map<string, Date>();
  for (const r of reviews) {
    if (!maxCreatedAtByInstitution.has(r.institutionId)) maxCreatedAtByInstitution.set(r.institutionId, r.createdAt);
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
