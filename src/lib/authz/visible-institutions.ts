import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, reviewerAssignments, coordinatorScopes } from "@/lib/db/schema";
import { getSedeOverallStatusMap } from "@/lib/sede-status";
import type { CurrentProfile } from "@/lib/auth/get-current-profile";

export { institutionIdInFilter } from "@/lib/db/institution-filter";

/**
 * Reimplementación en la aplicación de la función SQL `visible_institution_ids()`
 * (antes aplicada vía RLS en Supabase; ver docs/migracion-vercel-postgres.md).
 *
 * IMPORTANTE: ya no hay una segunda capa de seguridad a nivel de base de datos.
 * Toda consulta que devuelva datos de `institutions` (o tablas que cuelgan de ella:
 * expected_documents, physical_files, review_events, section_comments, etc.) DEBE
 * filtrar explícitamente usando el resultado de esta función. Omitir el filtro expone
 * datos de sedes que el usuario no debería ver.
 *
 * @returns `null` = sin restricción (administrador y consulta ven todas las sedes).
 *          `string[]` = lista de institution_id visibles (puede estar vacía).
 */
export async function visibleInstitutionIds(profile: CurrentProfile): Promise<string[] | null> {
  if (profile.role === "administrador" || profile.role === "consulta") return null;

  if (profile.role === "coordinador") {
    const rows = await db
      .select({ id: coordinatorScopes.institutionId })
      .from(coordinatorScopes)
      .where(and(eq(coordinatorScopes.profileId, profile.id), eq(coordinatorScopes.active, true)));
    return rows.map((r) => r.id);
  }

  // "sgd": ve las sedes que ya llegaron a "Trasladado a revisión SGD" (todos sus
  // apartados en "Cumple") y que todavía no se marcaron como "Traslado EAFIT" — una
  // vez que las revisa y las pasa a EAFIT, desaparecen de su lista.
  if (profile.role === "sgd") {
    const [overallMap, rows] = await Promise.all([
      getSedeOverallStatusMap(null),
      db.select({ id: institutions.id }).from(institutions).where(isNull(institutions.traspasoEafitAt)),
    ]);
    return rows.filter((r) => overallMap.get(r.id) === "trasladado_sgd").map((r) => r.id);
  }

  // "coordinador_eafit": ve las sedes que ya pasaron por "sgd" (traspaso_eafit_at
  // marcado) y que todavía no se marcaron como "Entregado a CPE".
  if (profile.role === "coordinador_eafit") {
    const rows = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(and(isNotNull(institutions.traspasoEafitAt), isNull(institutions.entregadoCpeAt)));
    return rows.map((r) => r.id);
  }

  // revisor
  return reviewQueueInstitutionIds(profile);
}

/**
 * Sedes que le tocan revisar PERSONALMENTE a este usuario (reviewer_assignments) —
 * usado solo por "Mi bandeja de revisión". A diferencia de `visibleInstitutionIds`,
 * un coordinador aquí NO ve todas las sedes de su coordinación (institutions.coordinator_profile_id),
 * sino únicamente las que además tiene asignadas como revisor individual (algunos de
 * los 14 revisores fueron ascendidos a coordinador pero conservan asignaciones propias).
 * `null` = sin restricción (solo administrador/consulta).
 */
export async function reviewQueueInstitutionIds(profile: CurrentProfile): Promise<string[] | null> {
  if (profile.role === "administrador" || profile.role === "consulta") return null;

  const rows = await db
    .select({ id: reviewerAssignments.institutionId })
    .from(reviewerAssignments)
    .where(and(eq(reviewerAssignments.profileId, profile.id), eq(reviewerAssignments.active, true)));
  return rows.map((r) => r.id);
}
