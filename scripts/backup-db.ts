/* Respaldo completo de todas las tablas a un único archivo JSON.
 * Uso: POSTGRES_URL=... npx tsx scripts/backup-db.ts <salida.json>
 */
import fs from "fs";
import postgres from "postgres";

const [outputPath] = process.argv.slice(2);
if (!process.env.POSTGRES_URL && !process.env.REPORTS_DB_URL && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const key = line.startsWith("REPORTS_DB_URL=") ? "REPORTS_DB_URL" : line.startsWith("POSTGRES_URL=") ? "POSTGRES_URL" : null;
    if (!key) continue;
    let value = line.slice(`${key}=`.length).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
// Si ambas variables están definidas Y apuntan a hosts distintos, es casi seguro un
// error de configuración (dejar REPORTS_DB_URL vieja mientras POSTGRES_URL se
// actualizó, o viceversa) -- exactamente el patrón que ya causó un incidente real de
// split-brain con la conexión principal. Se detiene en vez de respaldar en silencio
// la base equivocada, salvo que se confirme explícitamente con REPORTS_DB_URL_OK=1.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(no se pudo parsear)";
  }
}
if (
  process.env.REPORTS_DB_URL &&
  process.env.POSTGRES_URL &&
  hostOf(process.env.REPORTS_DB_URL) !== hostOf(process.env.POSTGRES_URL) &&
  process.env.REPORTS_DB_URL_OK !== "1"
) {
  console.error(
    `REPORTS_DB_URL (${hostOf(process.env.REPORTS_DB_URL)}) y POSTGRES_URL (${hostOf(process.env.POSTGRES_URL)}) ` +
      "apuntan a hosts DISTINTOS. Esto casi siempre es un error de configuración. " +
      "Si de verdad quieres respaldar la de REPORTS_DB_URL, vuelve a correr con REPORTS_DB_URL_OK=1."
  );
  process.exit(1);
}

const connectionString = process.env.REPORTS_DB_URL ?? process.env.POSTGRES_URL;
if (!connectionString || !outputPath) {
  console.error("Uso: npx tsx scripts/backup-db.ts <salida.json>");
  process.exit(1);
}
console.error(`Respaldando desde: ${hostOf(connectionString)} (${process.env.REPORTS_DB_URL ? "REPORTS_DB_URL" : "POSTGRES_URL"})`);

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const tablas = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  const backup: Record<string, unknown[]> = {};

  for (const { tablename } of tablas) {
    const rows = await sql.unsafe(`select * from ${tablename}`);
    backup[tablename] = rows as unknown[];
    console.log(`✓ ${tablename}: ${rows.length} filas`);
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), tables: backup }, null, 0)
  );
  console.log(`\n✓ Respaldo guardado en: ${outputPath}`);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
