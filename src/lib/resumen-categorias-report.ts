import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, reviewerAssignments, profiles } from "@/lib/db/schema";
import { getSedeAndApartadoStatusMaps, SEDE_OVERALL_STATUS_ORDER, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";

export interface ConsolidadoRow {
  categoria: string;
  cantidad: number;
}

export interface DetalleCategoriasRow {
  sourceRowId: string | null;
  daneCode: string;
  sedeName: string;
  institutionName: string;
  department: string;
  municipality: string;
  coordinatorName: string | null;
  mentorName: string | null;
  reviewerName: string | null;
  estadoGeneral: string;
  aprobadoSgd: boolean;
  rechazadoSgdSinReenviar: boolean;
  enSegundaRevisionSgd: boolean;
  trasladoEafit: boolean;
  entregadoCpe: boolean;
  reRevisionPendiente: boolean;
}

export interface ResumenCategoriasReport {
  consolidado: ConsolidadoRow[];
  detalle: DetalleCategoriasRow[];
}

/**
 * Mismas categorías que las tarjetas clicables del Resumen general (ver
 * sede-status.ts y page.tsx) — un consolidado con los mismos números que se ven
 * en pantalla, y un detalle sede por sede con a qué categoría pertenece cada una,
 * para poder descargar y repartir (2026-09-18, a pedido del usuario).
 */
export async function getResumenCategoriasReport(
  institutionIds: string[] | null
): Promise<ResumenCategoriasReport> {
  const { overallStatusMap } = await getSedeAndApartadoStatusMaps(institutionIds);

  const rows = await db
    .select({
      id: institutions.id,
      sourceRowId: institutions.sourceRowId,
      daneCode: institutions.daneCode,
      sedeName: institutions.sedeName,
      institutionName: institutions.institutionName,
      department: institutions.department,
      municipality: institutions.municipality,
      coordinatorName: institutions.coordinatorName,
      mentorName: institutions.mentorName,
      sgdDecision: institutions.sgdDecision,
      sgdSecondReviewRequestedAt: institutions.sgdSecondReviewRequestedAt,
      traspasoEafitAt: institutions.traspasoEafitAt,
      entregadoCpeAt: institutions.entregadoCpeAt,
      reReviewRequestedAt: institutions.reReviewRequestedAt,
    })
    .from(institutions);

  const reviewerRows = await db
    .select({ institutionId: reviewerAssignments.institutionId, reviewerName: profiles.fullName })
    .from(reviewerAssignments)
    .innerJoin(profiles, eq(profiles.id, reviewerAssignments.profileId))
    .where(eq(reviewerAssignments.active, true));
  const reviewerByInstitution = new Map(reviewerRows.map((r) => [r.institutionId, r.reviewerName]));

  const visibleSet = institutionIds !== null ? new Set(institutionIds) : null;

  const detalle: DetalleCategoriasRow[] = [];
  for (const r of rows) {
    if (visibleSet !== null && !visibleSet.has(r.id)) continue;

    const rechazado = r.sgdDecision === "rechazado";
    detalle.push({
      sourceRowId: r.sourceRowId,
      daneCode: r.daneCode,
      sedeName: r.sedeName,
      institutionName: r.institutionName,
      department: r.department,
      municipality: r.municipality,
      coordinatorName: r.coordinatorName,
      mentorName: r.mentorName,
      reviewerName: reviewerByInstitution.get(r.id) ?? null,
      estadoGeneral: SEDE_OVERALL_STATUS_META[overallStatusMap.get(r.id) ?? "sin_revisar"].label,
      aprobadoSgd: r.sgdDecision === "aprobado",
      rechazadoSgdSinReenviar: rechazado && !r.sgdSecondReviewRequestedAt,
      enSegundaRevisionSgd: rechazado && !!r.sgdSecondReviewRequestedAt,
      trasladoEafit: !!r.traspasoEafitAt,
      entregadoCpe: !!r.entregadoCpeAt,
      reRevisionPendiente: !!r.reReviewRequestedAt,
    });
  }
  detalle.sort((a, b) => a.sedeName.localeCompare(b.sedeName));

  const consolidado: ConsolidadoRow[] = [
    ...SEDE_OVERALL_STATUS_ORDER.map((status) => ({
      categoria: SEDE_OVERALL_STATUS_META[status].label,
      cantidad: detalle.filter((d) => d.estadoGeneral === SEDE_OVERALL_STATUS_META[status].label).length,
    })),
    { categoria: "Total sedes", cantidad: detalle.length },
    { categoria: "Aprobado por SGD", cantidad: detalle.filter((d) => d.aprobadoSgd).length },
    { categoria: "Rechazado por SGD (sin reenviar)", cantidad: detalle.filter((d) => d.rechazadoSgdSinReenviar).length },
    { categoria: "En segunda revisión de SGD", cantidad: detalle.filter((d) => d.enSegundaRevisionSgd).length },
    { categoria: "Traslado EAFIT", cantidad: detalle.filter((d) => d.trasladoEafit).length },
    { categoria: "Entregado a CPE", cantidad: detalle.filter((d) => d.entregadoCpe).length },
    { categoria: "Re-revisión pendiente (para revisores)", cantidad: detalle.filter((d) => d.reRevisionPendiente).length },
  ];

  return { consolidado, detalle };
}
