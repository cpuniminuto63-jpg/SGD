/* Informe 1: por cada día, cuántas sedes únicas revisó cada persona.
 * Informe 2: por persona, cuántas sedes está revisando por 2da, 3ra, ... vez
 * (contando visitas en días distintos a la misma sede).
 * Uso: POSTGRES_URL=... npx tsx scripts/report-sedes-por-dia-persona.ts
 */
import postgres from "postgres";
import fs from "fs";

if (!process.env.REPORTS_DB_URL && !process.env.POSTGRES_URL && fs.existsSync(".env.local")) {
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

const connectionString = process.env.REPORTS_DB_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  // Cada (persona, sede, día) tocado, sin duplicar por múltiples documentos/eventos.
  const rows = await sql`
    select distinct p.full_name as persona, ed.institution_id, date(re.created_at) as dia
    from review_events re
    join expected_documents ed on ed.id = re.expected_document_id
    join profiles p on p.id = re.reviewer_id
  `;

  // ---------- Informe 1: sedes únicas por día y por persona ----------
  const porDiaPersona = new Map<string, Map<string, Set<string>>>(); // dia -> persona -> set(institution_id)
  for (const r of rows) {
    const dia = new Date(r.dia).toISOString().slice(0, 10);
    const m = porDiaPersona.get(dia) ?? new Map<string, Set<string>>();
    const s = m.get(r.persona) ?? new Set<string>();
    s.add(r.institution_id);
    m.set(r.persona, s);
    porDiaPersona.set(dia, m);
  }

  console.log("=== INFORME 1: Sedes únicas revisadas por día y por persona ===\n");
  const dias = [...porDiaPersona.keys()].sort();
  for (const dia of dias) {
    const m = porDiaPersona.get(dia)!;
    const personas = [...m.entries()].sort((a, b) => b[1].size - a[1].size);
    const total = new Set([...m.values()].flatMap((s) => [...s])).size;
    console.log(`--- ${dia} (${total} sedes únicas tocadas en total) ---`);
    for (const [persona, set] of personas) {
      console.log(`  ${persona}: ${set.size} sedes`);
    }
    console.log("");
  }

  // ---------- Informe 2: cuántas sedes está revisando por 2da, 3ra, ... vez ----------
  // Para cada (persona, sede) contamos en cuántos días distintos la tocó -> ese es
  // el número de "vez" que la más reciente visita representa.
  const visitasPorPersonaSede = new Map<string, Map<string, Set<string>>>(); // persona -> sede -> set(dias)
  for (const r of rows) {
    const dia = new Date(r.dia).toISOString().slice(0, 10);
    const m = visitasPorPersonaSede.get(r.persona) ?? new Map<string, Set<string>>();
    const s = m.get(r.institution_id) ?? new Set<string>();
    s.add(dia);
    m.set(r.institution_id, s);
    visitasPorPersonaSede.set(r.persona, m);
  }

  console.log("\n=== INFORME 2: Sedes por número de vez revisadas (visitas en días distintos), por persona ===\n");
  const personasOrdenadas = [...visitasPorPersonaSede.keys()].sort();
  for (const persona of personasOrdenadas) {
    const m = visitasPorPersonaSede.get(persona)!;
    const conteoVeces = new Map<number, number>(); // numero de vez -> cantidad de sedes
    for (const [, dias] of m) {
      const veces = dias.size;
      conteoVeces.set(veces, (conteoVeces.get(veces) ?? 0) + 1);
    }
    const totalSedes = m.size;
    const repetidas = [...conteoVeces.entries()].filter(([veces]) => veces > 1).reduce((acc, [, n]) => acc + n, 0);
    console.log(`${persona}: ${totalSedes} sedes distintas tocadas, ${repetidas} revisadas más de una vez`);
    const ordenVeces = [...conteoVeces.keys()].sort((a, b) => a - b);
    for (const veces of ordenVeces) {
      const etiqueta = veces === 1 ? "1ra vez (solo una visita)" : veces === 2 ? "2da vez" : veces === 3 ? "3ra vez" : `${veces}ta vez`;
      console.log(`    ${etiqueta}: ${conteoVeces.get(veces)} sedes`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
