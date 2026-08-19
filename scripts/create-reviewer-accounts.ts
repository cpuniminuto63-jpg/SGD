/* Crea las 14 cuentas revisor + sus asignaciones de sede a partir de
 * "ASIGNACIÓN UNIMINUTO FINAL.xlsx" (hoja "DETALLADO POR EE", columna COORDINADOR),
 * y genera un Excel con Persona/Correo/Contraseña para repartir.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/create-reviewer-accounts.ts <ruta_asignacion.xlsx> <admin_profile_id> <ruta_salida.xlsx>
 */
import { randomBytes } from "node:crypto";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const [assignmentPath, adminProfileId, outputPath] = process.argv.slice(2);
if (!assignmentPath || !adminProfileId || !outputPath) {
  console.error(
    "Uso: npx tsx scripts/create-reviewer-accounts.ts <asignacion.xlsx> <admin_profile_id> <salida.xlsx>"
  );
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

// Nombre tal como aparece en la columna COORDINADOR de "DETALLADO POR EE" -> {fullName, email}
const PEOPLE: Record<string, { fullName: string; email: string }> = {
  ALEXANDRA: { fullName: "Alexandra", email: "jury.becerra.p@uniminuto.edu" },
  ANDREA: { fullName: "Andrea", email: "andrea.ortega.j@uniminuto.edu" },
  "ARMANDO GAMBOA": { fullName: "Armando Gamboa", email: "armangt2025@gmail.com" },
  "CARLOS LASTRE": { fullName: "Carlos Lastre", email: "celastrep@eafit.edu.co" },
  "CATALINA GIL": { fullName: "Catalina Gil", email: "ycgilq@eafit.edu.co" },
  "ESTELA ROSA": { fullName: "Estela Rosa", email: "ervasquezm@eafit.edu.co" },
  "LADDY TATIANA": { fullName: "Laddy Tatiana", email: "ltperdomor@eafit.edu.co" },
  "MARIA ELISA ROJAS ESTRADA": { fullName: "María Elisa Rojas Estrada", email: "maria.rojas.e@uniminuto.edu" },
  "MARIA FERNANDA": { fullName: "María Fernanda", email: "mfriverosc@eafit.edu.co" },
  "NICOLAS ARRIETA": { fullName: "Nicolás Arrieta", email: "nicolasayala@gmail.com" },
  "PATRICIA BERNAL": { fullName: "Patricia Bernal", email: "patricia.bernal.a@uniminuto.edu" },
  "SINDY LÓPEZ": { fullName: "Sindy López", email: "splopezp@eafit.edu.co" },
  "ANA ELISA": { fullName: "Ana Elisa", email: "afuente1@eafit.edu.co" },
  "YURIS VALDEZ": { fullName: "Yuris Valdez", email: "yurysvaldes@gmail.com" },
};

function formatDaneCode(cell: unknown): string {
  if (typeof cell === "number") return Math.round(cell).toString();
  return String(cell ?? "").trim();
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const wb = XLSX.readFile(assignmentPath);
  const ws = wb.Sheets["DETALLADO POR EE"];
  if (!ws) throw new Error('No se encontró la hoja "DETALLADO POR EE"');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  const data = rows.slice(1).filter((r) => r.some((v) => v !== ""));

  // 1) Crear (o reutilizar) las 14 cuentas.
  const credentials: { fullName: string; email: string; password: string }[] = [];
  const profileIdByName = new Map<string, string>();

  for (const [sourceName, { fullName, email }] of Object.entries(PEOPLE)) {
    const emailLower = email.trim().toLowerCase();
    const [existing] = await db.select().from(schema.profiles).where(eq(schema.profiles.email, emailLower)).limit(1);

    if (existing) {
      profileIdByName.set(sourceName, existing.id);
      console.log(`= Ya existía: ${fullName} <${emailLower}>`);
      continue;
    }

    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const [created] = await db
      .insert(schema.profiles)
      .values({ fullName, email: emailLower, passwordHash, role: "revisor", active: true })
      .returning();

    profileIdByName.set(sourceName, created.id);
    credentials.push({ fullName, email: emailLower, password: tempPassword });
    console.log(`+ Creada: ${fullName} <${emailLower}>`);
  }

  // 2) Mapear DANE -> institution_id.
  const institutions = await db.select({ id: schema.institutions.id, daneCode: schema.institutions.daneCode }).from(schema.institutions);
  const institutionIdByDane = new Map(institutions.map((i) => [i.daneCode, i.id]));

  // 3) Asignar sedes a cada revisor.
  let assigned = 0;
  let skippedNoInstitution = 0;
  let skippedNoPerson = 0;
  let alreadyAssigned = 0;

  for (const row of data) {
    const daneSede = formatDaneCode(row[8]);
    const sourceName = String(row[14] ?? "").trim();

    const profileId = profileIdByName.get(sourceName);
    if (!profileId) {
      skippedNoPerson++;
      continue;
    }

    const institutionId = institutionIdByDane.get(daneSede);
    if (!institutionId) {
      skippedNoInstitution++;
      continue;
    }

    const [existingAssignment] = await db
      .select({ id: schema.reviewerAssignments.id })
      .from(schema.reviewerAssignments)
      .where(
        and(eq(schema.reviewerAssignments.profileId, profileId), eq(schema.reviewerAssignments.institutionId, institutionId))
      )
      .limit(1);

    if (existingAssignment) {
      alreadyAssigned++;
      continue;
    }

    await db.insert(schema.reviewerAssignments).values({
      profileId,
      institutionId,
      assignedBy: adminProfileId,
      active: true,
    });
    assigned++;
  }

  console.log(`\nAsignaciones nuevas: ${assigned}`);
  console.log(`Ya existían: ${alreadyAssigned}`);
  console.log(`Sin sede coincidente (DANE no encontrado): ${skippedNoInstitution}`);
  console.log(`Sin persona coincidente: ${skippedNoPerson}`);

  // 4) Generar Excel de credenciales (solo de las cuentas NUEVAS; las que ya existían no
  // tienen contraseña nueva que mostrar).
  if (credentials.length > 0) {
    const sheetRows = credentials.map((c) => ({ Persona: c.fullName, Correo: c.email, Contraseña: c.password }));
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Credenciales");
    XLSX.writeFile(workbook, outputPath);
    console.log(`\n✓ Credenciales guardadas en: ${outputPath}`);
  } else {
    console.log("\nNo se generaron contraseñas nuevas (todas las cuentas ya existían).");
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
