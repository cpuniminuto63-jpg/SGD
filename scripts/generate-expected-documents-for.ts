/* Genera documentos esperados solo para las instituciones indicadas (no todas), para
 * cubrir el caso de sedes agregadas después de la generación masiva original (que no
 * es re-ejecutable sobre sedes existentes por el índice único en expected_documents).
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/generate-expected-documents-for.ts <institutionId...>
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { generateExpectedDocuments } from "../src/lib/import/generate-expected-documents";

const institutionIds = process.argv.slice(2);
if (institutionIds.length === 0) {
  console.error("Uso: npx tsx scripts/generate-expected-documents-for.ts <institutionId...>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const institutionsList = await db
    .select({ id: schema.institutions.id, linea: schema.institutions.linea })
    .from(schema.institutions)
    .where(inArray(schema.institutions.id, institutionIds));

  if (institutionsList.length !== institutionIds.length) {
    console.warn(`Aviso: se pidieron ${institutionIds.length} instituciones, se encontraron ${institutionsList.length}.`);
  }

  const catalog = await db
    .select({ id: schema.documentCatalog.id, sectionId: schema.documentCatalog.sectionId, required: schema.documentCatalog.required })
    .from(schema.documentCatalog)
    .where(isNull(schema.documentCatalog.validTo));

  const sections = await db.select({ id: schema.documentSections.id, actor: schema.documentSections.actor }).from(schema.documentSections);
  const actorBySectionId = new Map(sections.map((s) => [s.id, s.actor]));

  const rows = generateExpectedDocuments(
    institutionsList.map((i) => ({ id: i.id, linea: i.linea })),
    catalog.map((c) => ({ id: c.id, sectionId: c.sectionId, actor: actorBySectionId.get(c.sectionId) ?? null, required: c.required, perSession: true }))
  );

  const insertRows = rows.map((r) => ({
    institutionId: r.institution_id,
    sectionId: r.section_id,
    actor: r.actor,
    sessionNormalized: r.session_normalized,
    sessionNumber: r.session_number,
    documentCatalogId: r.document_catalog_id,
    required: r.required,
  }));

  // Idempotente: si ya existen filas para alguna de estas instituciones, se saltan.
  const already = await db
    .select({ institutionId: schema.expectedDocuments.institutionId })
    .from(schema.expectedDocuments)
    .where(inArray(schema.expectedDocuments.institutionId, institutionIds));
  const alreadyIds = new Set(already.map((r) => r.institutionId));
  const toInsert = insertRows.filter((r) => !alreadyIds.has(r.institutionId));

  if (alreadyIds.size > 0) {
    console.log(`Ya tenían documentos esperados (se omiten): ${[...alreadyIds].join(", ")}`);
  }

  if (toInsert.length === 0) {
    console.log("Nada por insertar.");
  } else {
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await db.insert(schema.expectedDocuments).values(toInsert.slice(i, i + BATCH));
    }
    console.log(`Insertados ${toInsert.length} documentos esperados para ${institutionsList.length - alreadyIds.size} sede(s).`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
