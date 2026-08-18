import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { prepare: false });
  const views = await sql`select table_name from information_schema.views where table_schema = 'public' order by table_name`;
  console.log("Vistas existentes:", JSON.stringify(views.map((v) => v.table_name)));

  const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  console.log("Tablas existentes:", JSON.stringify(tables.map((t) => t.table_name)));

  const counts = await sql`select count(*) from expected_documents`;
  console.log("expected_documents:", counts[0].count);

  await sql.end();
}

main();
