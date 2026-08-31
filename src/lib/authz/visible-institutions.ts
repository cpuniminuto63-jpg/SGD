import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, reviewerAssignments, coordinatorScopes } from "@/lib/db/schema";
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
      .select({ id: coordinatorScopes.institutionId })
      .from(coordinatorScopes)
      .where(and(eq(coordinatorScopes.profileId, profile.id), eq(coordinatorScopes.active, true)));
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

/**
 * Construye la condición `institution_id in (...)` para usar dentro de SQL crudo
 * (`db.execute(sql\`...\`)`) contra las vistas, que no son tablas Drizzle-tipadas.
 *
 * NO usar `institution_id = any(${ids}::uuid[])`: pasar un array de JS como parámetro
 * a través de drizzle-orm hacia postgres.js NO lo serializa como literal de arreglo de
 * Postgres (produce "malformed array literal" en tiempo de ejecución) — solo funciona
 * si se usa el tag `sql` nativo de postgres.js directamente, no el de drizzle-orm. Un
 * IN (...) con un parámetro por valor evita el problema por completo.
 *
 * Si `ids` está vacío (revisor sin sedes asignadas), devuelve una condición que nunca
 * es verdadera en vez de generar `IN ()`, que es SQL inválido.
 */
export function institutionIdInFilter(ids: string[]): SQL {
  if (ids.length === 0) {
    return sql`institution_id = '00000000-0000-0000-0000-000000000000'::uuid`;
  }
  return sql`institution_id in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )})`;
}
