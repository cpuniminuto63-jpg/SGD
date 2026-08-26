/* Borra todo el historial de revisión (fase de pruebas) para arrancar limpio:
 * review_events, section_reviews, section_comments. NO toca sedes, catálogo,
 * usuarios, asignaciones ni expected_documents.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/reset-review-data.ts
 */
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const re = await sql`delete from review_events returning id`;
  console.log(`review_events borrados: ${re.length}`);

  const sr = await sql`delete from section_reviews returning id`;
  console.log(`section_reviews borrados: ${sr.length}`);

  const sc = await sql`delete from section_comments returning id`;
  console.log(`section_comments borrados: ${sc.length}`);

  const check = await sql`
    select
      (select count(*)::int from review_events) as review_events,
      (select count(*)::int from section_reviews) as section_reviews,
      (select count(*)::int from section_comments) as section_comments,
      (select count(*)::int from institutions) as institutions,
      (select count(*)::int from expected_documents) as expected_documents,
      (select count(*)::int from profiles) as profiles
  `;
  console.log("Verificación final:", JSON.stringify(check[0], null, 2));

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
