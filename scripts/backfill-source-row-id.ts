/* Rellena institutions.source_row_id con la columna "ID" (índice 1) del archivo
 * maestro original BASE_UNIFICADA_4_COORDINADORES, emparejando por código DANE
 * de sede (columna índice 2).
 *
 * Uso: POSTGRES_URL=... npx tsx scripts/backfill-source-row-id.ts <ruta_base_original.xlsx>
 */
import XLSX from "xlsx";
import postgres from "postgres";

const [filePath] = process.argv.slice(2);
if (!filePath) {
  console.error("Uso: npx tsx scripts/backfill-source-row-id.ts <base_original.xlsx>");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

function formatDaneCode(cell: unknown): string {
  if (typeof cell === "number") return Math.round(cell).toString();
  return String(cell ?? "").trim();
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["BASE_UNIFICADA"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  const data = rows.slice(1).filter((r) => r.some((v) => v !== ""));

  const idByDane = new Map<string, string>();
  for (const row of data) {
    const dane = formatDaneCode(row[2]);
    const sourceId = String(row[1] ?? "").trim();
    if (dane && sourceId) idByDane.set(dane, sourceId);
  }
  console.log(`IDs leídos del archivo: ${idByDane.size}`);

  const institutions = await sql`select id, dane_code from institutions`;
  const toUpdate: { id: string; sourceId: string }[] = [];
  let sinId = 0;
  for (const inst of institutions) {
    const sourceId = idByDane.get(inst.dane_code);
    if (!sourceId) {
      sinId++;
      continue;
    }
    toUpdate.push({ id: inst.id, sourceId });
  }

  if (toUpdate.length > 0) {
    await sql`
      update institutions as i
      set source_row_id = v.source_id
      from (values ${sql(toUpdate.map((u) => [u.id, u.sourceId]))}) as v(id, source_id)
      where v.id::uuid = i.id
    `;
  }
  console.log(`Actualizadas: ${toUpdate.length} · Sin ID encontrado en el archivo: ${sinId}`);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
