import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!);
  const [institutions] = await sql`select count(*) from institutions`;
  const [catalog] = await sql`select count(*) from document_catalog`;
  const [expected] = await sql`select count(*) from expected_documents`;
  const dupes = await sql`select dane_code, count(*) from institutions group by dane_code having count(*) > 1`;
  console.log("institutions:", institutions.count);
  console.log("document_catalog:", catalog.count);
  console.log("expected_documents:", expected.count);
  console.log("DANE codes con más de una sede:", dupes.length, JSON.stringify(dupes));
  await sql.end();
}

main();
