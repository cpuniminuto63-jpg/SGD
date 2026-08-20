/* Corrige 2 evidencias del catálogo (07-10: estudiantes/docentes/directivos/familias)
 * que se estaban repitiendo por cada sesión cuando en realidad son un solo documento
 * por apartado: "Lista de asistencia física" y "Registro de asistencia de Qualtrics".
 * Marca esas entradas del catálogo como per_session=false y borra los expected_documents
 * duplicados (session_number > 1) que ya no corresponden. Verificado antes de correr:
 * ninguno de esos documentos duplicados tenía revisiones registradas.
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/fix-per-session-catalog.ts
 */
import postgres from "postgres";

const EVIDENCE_NAMES = [
  "Lista de asistencia física (PDF) - se carga afuera de las sesiones de trabajo",
  "Registro de asistencia de Qualtrics (PDF)",
];

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const updated = await sql`
    update document_catalog
    set per_session = false
    where evidence_name in ${sql(EVIDENCE_NAMES)}
      and valid_to is null
    returning id, evidence_name
  `;
  console.log(`Catálogo actualizado (per_session=false): ${updated.length} entradas`);
  for (const u of updated) console.log(`  - ${u.evidence_name}`);

  const safety = await sql`
    select count(*)::int as con_revision
    from expected_documents ed
    join document_catalog dc on dc.id = ed.document_catalog_id
    join review_events re on re.expected_document_id = ed.id
    where dc.evidence_name in ${sql(EVIDENCE_NAMES)}
      and ed.actor is not null
      and ed.session_number > 1
  `;
  if (safety[0].con_revision > 0) {
    console.error(
      `✗ Abortado: ${safety[0].con_revision} de los documentos a borrar YA tienen revisiones registradas. No se borra nada.`
    );
    await sql.end();
    process.exit(1);
  }

  const deleted = await sql`
    delete from expected_documents ed
    using document_catalog dc
    where dc.id = ed.document_catalog_id
      and dc.evidence_name in ${sql(EVIDENCE_NAMES)}
      and ed.actor is not null
      and ed.session_number > 1
    returning ed.id
  `;
  console.log(`Documentos esperados duplicados eliminados: ${deleted.length}`);

  const totales = await sql`
    select i.linea, count(*)::int as total
    from expected_documents ed
    join institutions i on i.id = ed.institution_id
    group by i.linea order by i.linea
  `;
  console.log("Nuevos totales de documentos esperados por línea:", JSON.stringify(totales));

  const gran = await sql`select count(*)::int as total from expected_documents`;
  console.log("Total general:", gran[0].total);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
