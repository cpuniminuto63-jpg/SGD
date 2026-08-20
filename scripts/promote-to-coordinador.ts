/* Cambia a Andrea, Patricia Bernal, Alexandra y María Elisa Rojas Estrada de rol
 * "revisor" a "coordinador" (para que tengan acceso a Exportación de resultados /
 * Asignación de sedes), y les asigna institutions.coordinator_profile_id en TODAS
 * las sedes de su coordinación original (institutions.coordinator_name) — el rol
 * coordinador resuelve visibilidad por esa columna, no por reviewer_assignments,
 * así que sin este paso perderían acceso a ver sus sedes en Mi bandeja/Sedes.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/promote-to-coordinador.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const ALIAS_POR_CORREO: Record<string, string> = {
  "andrea.ortega.j@uniminuto.edu": "ANGÉLICA",
  "patricia.bernal.a@uniminuto.edu": "VIVIANA",
  "jury.becerra.p@uniminuto.edu": "SERGIO", // Alexandra
  "maria.rojas.e@uniminuto.edu": "MARIA E", // María Elisa Rojas Estrada
};

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  for (const [email, alias] of Object.entries(ALIAS_POR_CORREO)) {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, email));
    if (!profile) {
      console.log(`✗ No existe cuenta con correo ${email}, se omite.`);
      continue;
    }

    await db.update(schema.profiles).set({ role: "coordinador" }).where(eq(schema.profiles.id, profile.id));

    const updated = await db
      .update(schema.institutions)
      .set({ coordinatorProfileId: profile.id })
      .where(eq(schema.institutions.coordinatorName, alias))
      .returning({ id: schema.institutions.id });

    console.log(`✓ ${profile.fullName} (${email}) -> coordinador, ${updated.length} sedes vinculadas (alias "${alias}")`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
