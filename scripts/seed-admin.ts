/* Crea la primera cuenta administrador (bootstrap, antes de que exista ningún admin
 * que pueda invitar desde /admin/usuarios). Uso:
 *   POSTGRES_URL=... npx tsx scripts/seed-admin.ts "Nombre Completo" correo@dominio.com
 * Genera una contraseña temporal aleatoria, la muestra una vez y la guarda hasheada.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { profiles } from "../src/lib/db/schema";

const fullName = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();

if (!fullName || !email) {
  console.error('Uso: npx tsx scripts/seed-admin.ts "Nombre Completo" correo@dominio.com');
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  const tempPassword = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [created] = await db
    .insert(profiles)
    .values({ fullName, email, passwordHash, role: "administrador", active: true })
    .returning({ id: profiles.id, email: profiles.email });

  console.log("✓ Cuenta administrador creada:");
  console.log("  Correo:", created.email);
  console.log("  Contraseña temporal (cópiala ahora, no se vuelve a mostrar):", tempPassword);

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló la creación del administrador:", err.message ?? err);
  process.exit(1);
});
