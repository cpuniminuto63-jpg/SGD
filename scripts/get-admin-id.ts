import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!);
  const rows = await sql`select id, email from profiles where role = 'administrador'`;
  console.log(JSON.stringify(rows));
  await sql.end();
}

main();
