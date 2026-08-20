/* Importa las sedes reales y el catálogo documental real directo a la base de datos,
 * reutilizando los mismos parsers/reglas que usa el asistente de importación de la app.
 * Uso:
 *   POSTGRES_URL=... npx tsx scripts/seed-real-data.ts <base_unificada.xlsx> <catalogo.xlsx> <admin_profile_id>
 */
import XLSX from "xlsx";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { parseInstitutions } from "../src/lib/import/parse-institutions";
import { parseCatalog } from "../src/lib/import/parse-catalog";
import { generateExpectedDocuments } from "../src/lib/import/generate-expected-documents";

const [baseUnificadaPath, catalogoPath, adminProfileId] = process.argv.slice(2);

if (!baseUnificadaPath || !catalogoPath || !adminProfileId) {
  console.error(
    "Uso: npx tsx scripts/seed-real-data.ts <base_unificada.xlsx> <catalogo.xlsx> <admin_profile_id>"
  );
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

function loadRows(path: string, sheetName?: string): unknown[][] {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[sheetName ?? wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
}

const INSERT_BATCH_SIZE = 1000;

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client, { schema });

  // --- Sedes ---
  const institutionRows = loadRows(baseUnificadaPath, "BASE_UNIFICADA").slice(2);
  const institutionsResult = parseInstitutions(institutionRows);
  console.log(`Sedes válidas: ${institutionsResult.valid.length}, observaciones: ${institutionsResult.errors.length}`);

  const [institutionsImport] = await db
    .insert(schema.imports)
    .values({ kind: "sedes", fileName: baseUnificadaPath.split(/[\\/]/).pop()!, uploadedBy: adminProfileId, status: "en_progreso" })
    .returning();

  // Postgres no permite que ON CONFLICT DO UPDATE afecte la misma fila dos veces dentro
  // del mismo INSERT: si dos filas de origen comparten (dane_code, sede_name) exactos,
  // hay que quedarse con una sola antes de insertar (la última gana, como en un upsert normal).
  const institutionRowsByKey = new Map(
    institutionsResult.valid.map((r) => [
      `${r.daneCode}|${r.sedeName}`,
      {
        daneCode: r.daneCode,
        sedeName: r.sedeName,
        institutionName: r.institutionName,
        department: r.department,
        municipality: r.municipality,
        linea: r.linea,
        coordinatorName: r.coordinatorName,
        mentorName: r.mentorName,
        mentorIdentifier: r.mentorIdentifier,
        sessionsRaw: r.sessionsRaw,
        sessionsNormalized: r.linea,
        sourceImportId: institutionsImport.id,
      },
    ])
  );
  const institutionRowsToInsert = [...institutionRowsByKey.values()];
  const duplicateKeysCollapsed = institutionsResult.valid.length - institutionRowsToInsert.length;
  if (duplicateKeysCollapsed > 0) {
    console.log(`Nota: ${duplicateKeysCollapsed} fila(s) con (DANE + sede) exactamente duplicados, se conservó la última.`);
  }

  for (let i = 0; i < institutionRowsToInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = institutionRowsToInsert.slice(i, i + INSERT_BATCH_SIZE);
    await db
      .insert(schema.institutions)
      .values(batch)
      .onConflictDoUpdate({
        target: [schema.institutions.daneCode, schema.institutions.sedeName],
        set: {
          institutionName: schema.institutions.institutionName,
          department: schema.institutions.department,
          municipality: schema.institutions.municipality,
          linea: schema.institutions.linea,
        },
      });
  }

  if (institutionsResult.errors.length > 0) {
    await db.insert(schema.importErrors).values(
      institutionsResult.errors.map((e) => ({
        importId: institutionsImport.id,
        rowNumber: e.rowNumber > 0 ? e.rowNumber : null,
        errorType: e.errorType,
        details: e.details,
      }))
    );
  }

  await db
    .update(schema.imports)
    .set({
      status: institutionsResult.errors.length > 0 ? "completado_con_errores" : "completado",
      summary: { validos: institutionsResult.valid.length, rechazados: institutionsResult.errors.length },
      completedAt: new Date(),
    })
    .where(eq(schema.imports.id, institutionsImport.id));

  // --- Catálogo documental ---
  const catalogRows = loadRows(catalogoPath, "ESTRUCTURA_DETALLE ").slice(2);
  const catalogResult = parseCatalog(catalogRows);
  console.log(`Entradas de catálogo: ${catalogResult.entries.length}, ambiguas: ${catalogResult.ambiguousRows.length}`);

  const [catalogImport] = await db
    .insert(schema.imports)
    .values({ kind: "catalogo", fileName: catalogoPath.split(/[\\/]/).pop()!, uploadedBy: adminProfileId, status: "en_progreso" })
    .returning();

  const sectionCodes = [...new Set(catalogResult.entries.map((e) => e.sectionCode))];
  const existingSections = await db
    .select({ id: schema.documentSections.id, code: schema.documentSections.code })
    .from(schema.documentSections)
    .where(inArray(schema.documentSections.code, sectionCodes));

  const sectionIdByCode = new Map(existingSections.map((s) => [s.code, s.id]));
  const missingSections = sectionCodes.filter((code) => !sectionIdByCode.has(code));

  if (missingSections.length > 0) {
    const created = await db
      .insert(schema.documentSections)
      .values(
        missingSections.map((code) => ({
          code,
          name: code.replace(/_/g, " "),
          actor: catalogResult.entries.find((e) => e.sectionCode === code)?.actor ?? null,
        }))
      )
      .returning({ id: schema.documentSections.id, code: schema.documentSections.code });
    for (const s of created) sectionIdByCode.set(s.code, s.id);
  }

  const catalogRowsToInsert = catalogResult.entries.map((entry) => ({
    sectionId: sectionIdByCode.get(entry.sectionCode)!,
    evidenceName: entry.evidenceName,
    description: entry.sectionDescription,
    required: entry.required,
    allowedExtensions: entry.allowedExtensions,
    allowedNamingPatterns: entry.allowedNamingPatterns,
    sourceImportId: catalogImport.id,
  }));

  await db.insert(schema.documentCatalog).values(catalogRowsToInsert);

  if (catalogResult.ambiguousRows.length > 0) {
    await db.insert(schema.importErrors).values(
      catalogResult.ambiguousRows.map((rowNumber) => ({
        importId: catalogImport.id,
        rowNumber,
        errorType: "regla_ambigua_pendiente_parametrizacion",
        details: {},
      }))
    );
  }

  await db
    .update(schema.imports)
    .set({
      status: catalogResult.ambiguousRows.length > 0 ? "completado_con_errores" : "completado",
      summary: { entradas: catalogResult.entries.length, ambiguas: catalogResult.ambiguousRows.length },
      completedAt: new Date(),
    })
    .where(eq(schema.imports.id, catalogImport.id));

  // --- Generar expected_documents ---
  const allInstitutions = await db
    .select({ id: schema.institutions.id, linea: schema.institutions.linea })
    .from(schema.institutions)
    .where(eq(schema.institutions.active, true));

  const allCatalog = await db
    .select({ id: schema.documentCatalog.id, sectionId: schema.documentCatalog.sectionId, required: schema.documentCatalog.required })
    .from(schema.documentCatalog);

  const allSections = await db.select({ id: schema.documentSections.id, actor: schema.documentSections.actor }).from(schema.documentSections);
  const actorBySectionId = new Map(allSections.map((s) => [s.id, s.actor]));

  const expectedRows = generateExpectedDocuments(
    allInstitutions,
    allCatalog.map((c) => ({ id: c.id, sectionId: c.sectionId, actor: actorBySectionId.get(c.sectionId) ?? null, required: c.required, perSession: true }))
  );

  // generateExpectedDocuments devuelve claves snake_case (institution_id, section_id, ...);
  // el esquema Drizzle usa camelCase — hay que mapear antes de insertar.
  const expectedRowsToInsert = expectedRows.map((r) => ({
    institutionId: r.institution_id,
    sectionId: r.section_id,
    actor: r.actor,
    sessionNormalized: r.session_normalized,
    sessionNumber: r.session_number,
    documentCatalogId: r.document_catalog_id,
    required: r.required,
  }));

  console.log(`Generando ${expectedRowsToInsert.length} documentos esperados...`);
  for (let i = 0; i < expectedRowsToInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = expectedRowsToInsert.slice(i, i + INSERT_BATCH_SIZE);
    await db.insert(schema.expectedDocuments).values(batch);
    process.stdout.write(`  ${Math.min(i + INSERT_BATCH_SIZE, expectedRowsToInsert.length)}/${expectedRowsToInsert.length}\r`);
  }

  console.log("\n✓ Importación completa.");
  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló la importación. Causa real:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
