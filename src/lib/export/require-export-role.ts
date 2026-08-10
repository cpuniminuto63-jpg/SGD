import { createClient } from "@/lib/supabase/server";
import type { Database, UserRole } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Variante de `requireRole` para Route Handlers: `redirect()` de next/navigation
 * no es apropiado aquí (no hay página a la que volver), así que devolvemos un
 * 403 explícito cuando el usuario no está autenticado o no tiene el rol requerido.
 */
export async function requireExportRole(
  ...roles: UserRole[]
): Promise<{ profile: Profile; response: null } | { profile: null; response: Response }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null, response: new Response("No autenticado.", { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.active) {
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
