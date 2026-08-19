/* Termina de asignar sedes a los revisores ya creados (batch, no fila por fila).
 * Uso: POSTGRES_URL=... npx tsx scripts/finish-reviewer-assignments.ts <asignacion.xlsx> <admin_profile_id>
 */
import XLSX from "xlsx";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const [assignmentPath, adminProfileId] = process.argv.slice(2);
if (!assignmentPath || !adminProfileId) {
  console.error("Uso: npx tsx scripts/finish-reviewer-assignments.ts <asignacion.xlsx> <admin_profile_id>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

const PEOPLE_EMAIL: Record<string, string> = {
  ALEXANDRA: "jury.becerra.p@uniminuto.edu",
  ANDREA: "andrea.ortega.j@uniminuto.edu",
  "ARMANDO GAMBOA": "armangt2025@gmail.com",
  "CARLOS LASTRE": "celastrep@eafit.edu.co",
  "CATALINA GIL": "ycgilq@eafit.edu.co",
  "ESTELA ROSA": "ervasquezm@eafit.edu.co",
  "LADDY TATIANA": "ltperdomor@eafit.edu.co",
  "MARIA ELISA ROJAS ESTRADA": "maria.rojas.e@uniminuto.edu",
  "MARIA FERNANDA": "mfriverosc@eafit.edu.co",
  "NICOLAS ARRIETA": "nicolasayala@gmail.com",
  "PATRICIA BERNAL": "patricia.bernal.a@uniminuto.edu",
  "SINDY LÓPEZ": "splopezp@eafit.edu.co",
  "ANA ELISA": "afuente1@eafit.edu.co",
  "YURIS VALDEZ": "yurysvaldes@gmail.com",
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
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  const data = rows.slice(1).filter((r) => r.some((v) => v !== ""));

  const [profiles, institutions, existingAssignments] = await Promise.all([
    db.select({ id: schema.profiles.id, email: schema.profiles.email }).from(schema.profiles),
    db.select({ id: schema.institutions.id, daneCode: schema.institutions.daneCode }).from(schema.institutions),
    db.select({ profileId: schema.reviewerAssignments.profileId, institutionId: schema.reviewerAssignments.institutionId }).from(
      schema.reviewerAssignments
    ),
  ]);

  const profileIdByEmail = new Map(profiles.map((p) => [p.email, p.id]));
  const institutionIdByDane = new Map(institutions.map((i) => [i.daneCode, i.id]));
  const existingKeys = new Set(existingAssignments.map((a) => `${a.profileId}|${a.institutionId}`));

  const toInsert: { profileId: string; institutionId: string; assignedBy: string; active: boolean }[] = [];
  let skippedNoInstitution = 0;
  let skippedNoPerson = 0;

  for (const row of data) {
    const daneSede = formatDaneCode(row[8]);
    const sourceName = String(row[14] ?? "").trim();
    const email = PEOPLE_EMAIL[sourceName];
    const profileId = email ? profileIdByEmail.get(email) : undefined;
    if (!profileId) {
      skippedNoPerson++;
      continue;
    }
    const institutionId = institutionIdByDane.get(daneSede);
    if (!institutionId) {
      skippedNoInstitution++;
      continue;
    }
    const key = `${profileId}|${institutionId}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key); // evita duplicados dentro del mismo archivo
    toInsert.push({ profileId, institutionId, assignedBy: adminProfileId, active: true });
  }

  console.log(`Por insertar: ${toInsert.length}`);
  if (toInsert.length > 0) {
    await db.insert(schema.reviewerAssignments).values(toInsert);
  }
  console.log(`Sin sede coincidente (DANE no encontrado): ${skippedNoInstitution}`);
  console.log(`Sin persona coincidente: ${skippedNoPerson}`);

  const countResult = await db.execute(sql`select count(*)::int as count from reviewer_assignments`);
  const total = (countResult as unknown as { count: number }[])[0]?.count;
  console.log("Total reviewer_assignments ahora:", total);

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
