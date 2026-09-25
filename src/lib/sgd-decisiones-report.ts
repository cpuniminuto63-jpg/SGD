import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { institutions, profiles } from "@/lib/db/schema";
import { getSedeOverallStatusMap } from "@/lib/sede-status";

export interface SgdDecisionRow {
  sourceRowId: string | null;
  daneCode: string;
  sedeName: string;
  institutionName: string;
  department: string;
  municipality: string;
  decision: "Aprobado" | "Rechazado" | "Sin decisión";
  decisionAt: Date | null;
  decisionBy: string | null;
  rejectionComment: string | null;
  segundaRevisionRequestedAt: Date | null;
  segundaRevisionRequestedBy: string | null;
  traspasoEafitAt: Date | null;
  entregadoCpeAt: Date | null;
}

/**
 * Toda sede que en algún momento llegó a "Trasladado a revisión SGD" — ya sea que
 * hoy siga esperando decisión, la hayan aprobado o rechazado, o ya avanzó a
 * EAFIT/CPE. Para el informe descargable de la cadena SGD → EAFIT → CPE
 * (2026-09-17, a pedido del usuario — visible también en Resumen general e
 * incluido en el informe de coordinadores).
 */
export async function getSgdDecisionesReport(): Promise<SgdDecisionRow[]> {
  const overallStatusMap = await getSedeOverallStatusMap(null);
  const trasladadoIds = new Set([...overallStatusMap.entries()].filter(([, s]) => s === "trasladado_sgd").map(([id]) => id));

  const decidedBy = alias(profiles, "decided_by");
  const requestedBy = alias(profiles, "requested_by");

  const rows = await db
    .select({
      id: institutions.id,
      sourceRowId: institutions.sourceRowId,
      daneCode: institutions.daneCode,
      sedeName: institutions.sedeName,
      institutionName: institutions.institutionName,
      department: institutions.department,
      municipality: institutions.municipality,
      sgdDecision: institutions.sgdDecision,
      sgdDecisionAt: institutions.sgdDecisionAt,
      sgdDecisionByName: decidedBy.fullName,
      sgdRejectionComment: institutions.sgdRejectionComment,
      sgdSecondReviewRequestedAt: institutions.sgdSecondReviewRequestedAt,
      sgdSecondReviewRequestedByName: requestedBy.fullName,
      traspasoEafitAt: institutions.traspasoEafitAt,
      entregadoCpeAt: institutions.entregadoCpeAt,
    })
    .from(institutions)
    .leftJoin(decidedBy, eq(decidedBy.id, institutions.sgdDecisionBy))
    .leftJoin(requestedBy, eq(requestedBy.id, institutions.sgdSecondReviewRequestedBy));

  const result: SgdDecisionRow[] = [];
  for (const r of rows) {
    // Incluye la sede si sigue "trasladado_sgd" hoy, o si ya avanzó más allá
    // (tiene decisión, o ya pasó por EAFIT/CPE) — así no desaparece del informe
    // al avanzar de etapa.
    const enPipelineSgd = trasladadoIds.has(r.id) || r.sgdDecision !== null || r.traspasoEafitAt !== null;
    if (!enPipelineSgd) continue;

    result.push({
      sourceRowId: r.sourceRowId,
      daneCode: r.daneCode,
      sedeName: r.sedeName,
      institutionName: r.institutionName,
      department: r.department,
      municipality: r.municipality,
      decision: r.sgdDecision === "aprobado" ? "Aprobado" : r.sgdDecision === "rechazado" ? "Rechazado" : "Sin decisión",
      decisionAt: r.sgdDecisionAt,
      decisionBy: r.sgdDecisionByName,
      rejectionComment: r.sgdRejectionComment,
      segundaRevisionRequestedAt: r.sgdSecondReviewRequestedAt,
      segundaRevisionRequestedBy: r.sgdSecondReviewRequestedByName,
      traspasoEafitAt: r.traspasoEafitAt,
      entregadoCpeAt: r.entregadoCpeAt,
    });
  }

  return result.sort((a, b) => (b.decisionAt?.getTime() ?? 0) - (a.decisionAt?.getTime() ?? 0));
}
