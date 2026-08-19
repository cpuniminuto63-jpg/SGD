/* Genera contraseñas temporales nuevas para las 14 cuentas revisor creadas y
 * escribe un Excel con Persona/Correo/Contraseña. El script anterior
 * (create-reviewer-accounts.ts) fue interrumpido antes de escribir este Excel,
 * así que las contraseñas originales quedaron irrecuperables (solo existía el
 * hash bcrypt) — este script las reemplaza por unas nuevas.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/reset-reviewer-passwords.ts <ruta_salida.xlsx>
 */
import { randomBytes } from "node:crypto";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const [outputPath] = process.argv.slice(2);
if (!outputPath) {
  console.error("Uso: npx tsx scripts/reset-reviewer-passwords.ts <salida.xlsx>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

const PEOPLE: { fullName: string; email: string }[] = [
  { fullName: "Alexandra", email: "jury.becerra.p@uniminuto.edu" },
  { fullName: "Andrea", email: "andrea.ortega.j@uniminuto.edu" },
  { fullName: "Armando Gamboa", email: "armangt2025@gmail.com" },
  { fullName: "Carlos Lastre", email: "celastrep@eafit.edu.co" },
  { fullName: "Catalina Gil", email: "ycgilq@eafit.edu.co" },
  { fullName: "Estela Rosa", email: "ervasquezm@eafit.edu.co" },
  { fullName: "Laddy Tatiana", email: "ltperdomor@eafit.edu.co" },
  { fullName: "María Elisa Rojas Estrada", email: "maria.rojas.e@uniminuto.edu" },
  { fullName: "María Fernanda", email: "mfriverosc@eafit.edu.co" },
  { fullName: "Nicolás Arrieta", email: "nicolasayala@gmail.com" },
  { fullName: "Patricia Bernal", email: "patricia.bernal.a@uniminuto.edu" },
  { fullName: "Sindy López", email: "splopezp@eafit.edu.co" },
  { fullName: "Ana Elisa", email: "afuente1@eafit.edu.co" },
  { fullName: "Yuris Valdez", email: "yurysvaldes@gmail.com" },
];

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const credentials: { fullName: string; email: string; password: string }[] = [];

  for (const { fullName, email } of PEOPLE) {
    const emailLower = email.trim().toLowerCase();
    const [existing] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, emailLower)).limit(1);
    if (!existing) {
      console.log(`✗ No existe: ${fullName} <${emailLower}> — se omite`);
      continue;
    }

    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await db.update(schema.profiles).set({ passwordHash }).where(eq(schema.profiles.id, existing.id));

    credentials.push({ fullName, email: emailLower, password: tempPassword });
    console.log(`✓ Clave restablecida: ${fullName} <${emailLower}>`);
  }

  const sheetRows = credentials.map((c) => ({ Persona: c.fullName, Correo: c.email, Contraseña: c.password }));
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Credenciales");
  XLSX.writeFile(workbook, outputPath);
  console.log(`\n✓ Credenciales guardadas en: ${outputPath}`);

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
