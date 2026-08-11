import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!);
  const byLinea = await sql`select linea, count(*) from institutions group by linea order by linea`;
  console.log("Sedes por línea:", JSON.stringify(byLinea));

  const catalogByActor = await sql`
    select coalesce(ds.actor::text, 'general') as actor, count(*)
    from document_catalog dc
    join document_sections ds on ds.id = dc.section_id
    group by ds.actor
    order by actor
  `;
  console.log("Entradas de catálogo por actor:", JSON.stringify(catalogByActor));

  const totalExpected = await sql`select count(*) from expected_documents`;
  console.log("Total expected_documents:", totalExpected[0].count);

  const generalCount = await sql`select count(*) from expected_documents where actor is null`;
  console.log("Documentos generales (sin actor):", generalCount[0].count);

  const perActorCount = await sql`select actor, count(*) from expected_documents where actor is not null group by actor`;
  console.log("Documentos por actor:", JSON.stringify(perActorCount));

  await sql.end();
}

main();
