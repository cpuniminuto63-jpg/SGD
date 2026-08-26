/* % de avance (carpetas en Cumple / 14) por sede revisada cada día, y diagnóstico
 * de por qué no pasan a "Trasladado a SGD" (qué carpeta(s) faltan).
 * Uso: POSTGRES_URL=... npx tsx scripts/report-porcentaje-sgd.ts
 */
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

function deriveApartadoStatus(statuses: string[]): string {
  if (statuses.length === 0) return "pendiente_revision";
  if (statuses.includes("volver_a_campo")) return "volver_a_campo";
  if (statuses.some((s) => s === "no_esta" || s === "pendiente_subsanar")) return "pendiente_subsanar";
  if (statuses.includes("pendiente_revision")) return "pendiente_revision";
  return "cumple";
}

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const dias = await sql`
    select date(re.created_at) as dia, array_agg(distinct ed.institution_id) as sedes
    from review_events re
    join expected_documents ed on ed.id = re.expected_document_id
    group by date(re.created_at)
    order by dia
  `;

  const bloqueoGlobal = new Map<string, number>();

  for (const { dia, sedes } of dias) {
    console.log(`\n=== ${new Date(dia).toISOString().slice(0, 10)} — ${sedes.length} sedes ===`);

    const docRows = await sql`
      with ultimo_evento as (
        select distinct on (expected_document_id) expected_document_id, status
        from review_events
        order by expected_document_id, created_at desc
      )
      select ed.institution_id, ed.section_id, ed.required,
        coalesce(ue.status, 'pendiente_revision') as estado,
        ds.name as apartado, i.sede_name
      from expected_documents ed
      join document_sections ds on ds.id = ed.section_id
      join institutions i on i.id = ed.institution_id
      left join ultimo_evento ue on ue.expected_document_id = ed.id
      where ed.institution_id = any(${sedes})
    `;

    const porCarpeta = new Map<string, { obligatorios: string[]; todos: string[] }>();
    const sedeNameById = new Map<string, string>();
    for (const r of docRows) {
      sedeNameById.set(r.institution_id, r.sede_name);
      const key = `${r.institution_id}|${r.apartado}`;
      const bucket = porCarpeta.get(key) ?? { obligatorios: [], todos: [] };
      bucket.todos.push(r.estado);
      if (r.required) bucket.obligatorios.push(r.estado);
      porCarpeta.set(key, bucket);
    }

    const statusPorSede = new Map<string, Record<string, string>>();
    for (const [key, { obligatorios, todos }] of porCarpeta) {
      const [institutionId, apartado] = key.split("|");
      const status = deriveApartadoStatus(obligatorios.length > 0 ? obligatorios : todos);
      const m = statusPorSede.get(institutionId) ?? {};
      m[apartado] = status;
      statusPorSede.set(institutionId, m);
    }

    let sumaPct = 0;
    let trasladadas = 0;
    for (const [institutionId, apartados] of statusPorSede) {
      const total = Object.keys(apartados).length;
      const cumple = Object.values(apartados).filter((s) => s === "cumple").length;
      const pct = total > 0 ? Math.round((cumple / total) * 100) : 0;
      sumaPct += pct;
      const esTrasladado = cumple === total;
      if (esTrasladado) trasladadas++;

      const faltantes = Object.entries(apartados).filter(([, s]) => s !== "cumple").map(([a]) => a);
      for (const f of faltantes) bloqueoGlobal.set(f, (bloqueoGlobal.get(f) ?? 0) + 1);

      console.log(
        `  ${sedeNameById.get(institutionId)}: ${pct}% (${cumple}/${total})${
          esTrasladado ? " -> TRASLADADO A SGD" : faltantes.length <= 3 ? ` — falta: ${faltantes.join(", ")}` : ` — faltan ${faltantes.length} carpetas`
        }`
      );
    }
    console.log(`  Promedio del día: ${Math.round(sumaPct / statusPorSede.size)}% · Trasladadas a SGD: ${trasladadas}/${statusPorSede.size}`);
  }

  console.log("\n=== Qué carpeta bloquea más seguido el traslado a SGD (entre todas las sedes revisadas) ===");
  const ordenado = [...bloqueoGlobal.entries()].sort((a, b) => b[1] - a[1]);
  for (const [apartado, n] of ordenado) console.log(`  ${apartado}: bloquea en ${n} sedes`);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
