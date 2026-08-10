import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/types";

type Profile = typeof profiles.$inferSelect;

/**
 * Variante de `requireRole` para Route Handlers: `redirect()` de next/navigation
 * no es apropiado aquí (no hay página a la que volver), así que devolvemos un
 * 403 explícito cuando el usuario no está autenticado o no tiene el rol requerido.
 */
export async function requireExportRole(
  ...roles: UserRole[]
): Promise<{ profile: Profile; response: null } | { profile: null; response: Response }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { profile: null, response: new Response("No autenticado.", { status: 401 }) };
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);

  if (!profile || !profile.active) {
    return { profile: null, response: new Response("Cuenta inválida o inactiva.", { status: 403 }) };
  }

  if (!roles.includes(profile.role)) {
    return {
      profile: null,
      response: new Response("No tienes permiso para generar esta exportación.", { status: 403 }),
    };
  }

  return { profile, response: null };
}
