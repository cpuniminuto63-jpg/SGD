/* Ejecuta un archivo .sql contra POSTGRES_URL/DATABASE_URL. Uso:
 *   npx tsx scripts/apply-sql-file.ts drizzle/0001_views_and_indexes.sql
 * Pensado para SQL que drizzle-kit push no puede expresar (vistas, índices con expresiones).
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: npx tsx scripts/apply-sql-file.ts <ruta.sql>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const fileContents = readFileSync(filePath, "utf-8");

sql
  .unsafe(fileContents)
  .then(() => {
    console.log(`✓ Aplicado: ${filePath}`);
    return sql.end();
  })
  .catch(async (error) => {
    console.error(`✗ Falló ${filePath}:`, error.message ?? error);
    await sql.end();
    process.exit(1);
  });
