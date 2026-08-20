import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/* Endpoint temporal de diagnóstico para verificar conectividad a la base de datos
 * desde un hosting nuevo. Borrar una vez confirmado que todo funciona. */
export async function GET() {
  const checks: Record<string, unknown> = {
    tieneVarPostgresUrl: Boolean(process.env.POSTGRES_URL),
    tieneVarAuthSecret: Boolean(process.env.AUTH_SECRET),
    tieneVarSiteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const result = await db.execute(sql`select count(*)::int as total from profiles`);
    checks.conexionBaseDatos = "OK";
    checks.perfilesEnBaseDatos = (result as unknown as { total: number }[])[0]?.total;
  } catch (err) {
    checks.conexionBaseDatos = "FALLÓ";
    checks.errorConexion = err instanceof Error ? err.message : String(err);
  }

  return Response.json(checks);
}
