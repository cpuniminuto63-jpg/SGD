/* Dos correcciones al catálogo pedidas por el usuario (2026-08-21):
 * 1) "Tres fotografía del encuentro (JPG)" en 01 SOCIALIZACION es un duplicado
 *    erróneo de "Una fotografía del encuentro (JPG)" (la correcta, obligatoria).
 *    Se retira del catálogo (valid_to) y se borran los expected_documents que
 *    generó, EXCEPTO los que ya tienen una revisión registrada (para no perder
 *    historial real).
 * 2) "Registro de asistencia de Qualtrics (PDF)" en 07/08/09/10 (estudiantes,
 *    docentes, directivos, familias) pasa a llamarse "RA EXCEL". Solo esas 4 —
 *    las mismas evidencias en 01/12/14 (sedes generales) no se tocan.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/fix-catalog-items.ts
 */
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  // 1) Retirar "Tres fotografía del encuentro (JPG)" de 01 SOCIALIZACION.
  const [catalogEntry] = await sql`
    select dc.id
    from document_catalog dc
    join document_sections ds on ds.id = dc.section_id
    where dc.evidence_name = ${"Tres fotografía del encuentro (JPG)"} and ds.name = ${"01 SOCIALIZACION"} and dc.valid_to is null
  `;

  if (catalogEntry) {
    const deleted = await sql`
      delete from expected_documents ed
      where ed.document_catalog_id = ${catalogEntry.id}
        and not exists (select 1 from review_events re where re.expected_document_id = ed.id)
      returning ed.id
    `;
    console.log(`Documentos esperados eliminados (sin revisión): ${deleted.length}`);

    const restantes = await sql`select count(*)::int as n from expected_documents where document_catalog_id = ${catalogEntry.id}`;
    console.log(`Quedan (con revisión, se conservan): ${restantes[0].n}`);

    await sql`update document_catalog set valid_to = now() where id = ${catalogEntry.id}`;
    console.log("Catálogo: entrada marcada como retirada (valid_to).");
  } else {
    console.log("No se encontró la entrada de catálogo a retirar (revisar si ya se corrigió antes).");
  }

  // 2) Renombrar "Registro de asistencia de Qualtrics (PDF)" -> "RA EXCEL" solo
  // en las 4 secciones de actor.
  const renamed = await sql`
    update document_catalog dc
    set evidence_name = 'RA EXCEL'
    from document_sections ds
    where ds.id = dc.section_id
      and dc.evidence_name = ${"Registro de asistencia de Qualtrics (PDF)"}
      and ds.name in (${"07 ESTUDIANTES"}, ${"08 DOCENTES"}, ${"09 DIRECTIVOS"}, ${"10 FAMILIAS"})
      and dc.valid_to is null
    returning ds.name as apartado
  `;
  console.log(`Renombrado a "RA EXCEL" en: ${renamed.map((r) => r.apartado).join(", ")}`);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
