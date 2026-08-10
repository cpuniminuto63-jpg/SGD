import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, reviewerAssignments } from "@/lib/db/schema";
import type { CurrentProfile } from "@/lib/auth/get-current-profile";

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
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.coordinatorProfileId, profile.id));
    return rows.map((r) => r.id);
  }

  // revisor
  const rows = await db
    .select({ id: reviewerAssignments.institutionId })
    .from(reviewerAssignments)
    .where(and(eq(reviewerAssignments.profileId, profile.id), eq(reviewerAssignments.active, true)));
  return rows.map((r) => r.id);
}
