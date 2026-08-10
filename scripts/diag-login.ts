/* Diagnóstico puntual: verifica si el login fallido es por credenciales reales
 * o por otra causa (perfil no encontrado, hash roto, cuenta inactiva, etc).
 * Uso: POSTGRES_URL=... npx tsx scripts/diag-login.ts correo@dominio.com "contraseña"
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { profiles } from "../src/lib/db/schema";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString || !email || !password) {
  console.error('Uso: npx tsx scripts/diag-login.ts correo@dominio.com "contraseña"');
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  const rows = await db.select().from(profiles).where(eq(profiles.email, email!)).limit(1);
  console.log("Perfiles encontrados con ese correo:", rows.length);

  if (rows.length === 0) {
    console.log("→ No existe un perfil con ese correo exacto.");
    const all = await db.select({ email: profiles.email, role: profiles.role }).from(profiles);
    console.log("Correos existentes en la tabla profiles:", all);
    await client.end();
    return;
  }

  const profile = rows[0];
  console.log("active:", profile.active);
  console.log("role:", profile.role);
  console.log("passwordHash presente:", !!profile.passwordHash);

  if (profile.passwordHash) {
    const valid = await bcrypt.compare(password!, profile.passwordHash);
    console.log("¿La contraseña coincide con el hash guardado?:", valid);
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Error de diagnóstico:", err.message ?? err);
  process.exit(1);
});
