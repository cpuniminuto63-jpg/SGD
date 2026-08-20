/* ISABEL JUSAYU (institución 728ed928-ee11-4651-9698-5ccab903f2c8) quedó con
 * expected_documents generados bajo su línea vieja (L1, de cuando el registro tenía
 * los datos de YERICA por el choque de DANE duplicado) después de que se le corrigió
 * institutions.linea a L3 (su valor correcto). Verificado: cero revisiones/veredictos
 * existentes para esta institución, así que es seguro borrar y regenerar.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/fix-isabel-jusayu-linea.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { generateExpectedDocuments } from "../src/lib/import/generate-expected-documents";

const INSTITUTION_ID = "728ed928-ee11-4651-9698-5ccab903f2c8";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const [institution] = await db
    .select({ id: schema.institutions.id, linea: schema.institutions.linea, sedeName: schema.institutions.sedeName })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, INSTITUTION_ID));
  if (!institution) throw new Error("No se encontró la institución");
  console.log(`Institución: ${institution.sedeName}, línea actual: ${institution.linea}`);

  // Seguridad: confirmar de nuevo que no hay revisiones antes de borrar.
  const existingReviews = await db.execute(
    `select count(*)::int as n from review_events re join expected_documents ed on ed.id = re.expected_document_id where ed.institution_id = '${INSTITUTION_ID}'` as unknown as never
  );
  const n = (existingReviews as unknown as { n: number }[])[0]?.n ?? 0;
  if (n > 0) {
    console.error(`✗ Abortado: hay ${n} revisiones existentes, no se borra nada.`);
    process.exit(1);
  }

  const deleted = await db
    .delete(schema.expectedDocuments)
    .where(eq(schema.expectedDocuments.institutionId, INSTITUTION_ID))
    .returning({ id: schema.expectedDocuments.id });
  console.log(`Eliminados (línea vieja): ${deleted.length}`);

  const catalog = await db
    .select({
      id: schema.documentCatalog.id,
      sectionId: schema.documentCatalog.sectionId,
      required: schema.documentCatalog.required,
      perSession: schema.documentCatalog.perSession,
    })
    .from(schema.documentCatalog)
    .where(isNull(schema.documentCatalog.validTo));

  const sections = await db.select({ id: schema.documentSections.id, actor: schema.documentSections.actor }).from(schema.documentSections);
  const actorBySectionId = new Map(sections.map((s) => [s.id, s.actor]));

  const rows = generateExpectedDocuments(
    [{ id: institution.id, linea: institution.linea }],
    catalog.map((c) => ({
      id: c.id,
      sectionId: c.sectionId,
      actor: actorBySectionId.get(c.sectionId) ?? null,
      required: c.required,
      perSession: c.perSession,
    }))
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
  await db.insert(schema.expectedDocuments).values(insertRows);
  console.log(`Regenerados con línea ${institution.linea}: ${insertRows.length}`);

  await client.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.cause?.message ?? err.message ?? err);
  process.exit(1);
});
