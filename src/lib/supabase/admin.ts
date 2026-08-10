import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente con la service role key de Supabase. Solo debe usarse dentro de
 * archivos "use server" (server actions / route handlers), nunca en código
 * que se envíe al navegador. Permite operaciones administrativas como
 * invitar usuarios (auth.admin.*) que la anon key no puede realizar.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está configurada en este entorno. Defínela en .env.local " +
        "(nunca la expongas al cliente) para poder invitar usuarios."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
