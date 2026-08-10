/* Genera expected_documents asumiendo que sedes y catálogo ya están importados.
 * Uso: POSTGRES_URL=... npx tsx scripts/generate-expected-only.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { generateExpectedDocuments } from "../src/lib/import/generate-expected-documents";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

const INSERT_BATCH_SIZE = 1000;

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db.select({ id: schema.expectedDocuments.id }).from(schema.expectedDocuments).limit(1);
  if (existing.length > 0) {
    console.error("Ya existen expected_documents en la base de datos. Aborta para no duplicar.");
    await client.end();
    process.exit(1);
  }

  const allInstitutions = await db
    .select({ id: schema.institutions.id, linea: schema.institutions.linea })
    .from(schema.institutions)
    .where(eq(schema.institutions.active, true));

  const allCatalog = await db
    .select({ id: schema.documentCatalog.id, sectionId: schema.documentCatalog.sectionId, required: schema.documentCatalog.required })
    .from(schema.documentCatalog);

  const allSections = await db
    .select({ id: schema.documentSections.id, actor: schema.documentSections.actor })
    .from(schema.documentSections);
  const actorBySectionId = new Map(allSections.map((s) => [s.id, s.actor]));

  console.log(`Sedes: ${allInstitutions.length}, catálogo: ${allCatalog.length}`);

  const expectedRows = generateExpectedDocuments(
    allInstitutions,
    allCatalog.map((c) => ({ id: c.id, sectionId: c.sectionId, actor: actorBySectionId.get(c.sectionId) ?? null, required: c.required }))
  );

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
    console.log(`  ${Math.min(i + INSERT_BATCH_SIZE, expectedRowsToInsert.length)}/${expectedRowsToInsert.length}`);
  }

  console.log("✓ Listo.");
  await client.end();
}

main().catch(async (err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
