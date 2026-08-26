/* Informe puntual pedido por el usuario (2026-08-21): cuántas sedes se revisaron
 * por día, y de esas, cómo está el estado (calculado, automático) de cada carpeta.
 * Uso: POSTGRES_URL=... npx tsx scripts/report-diario-carpetas.ts
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

  for (const { dia, sedes } of dias) {
    console.log(`\n=== ${new Date(dia).toISOString().slice(0, 10)} — ${sedes.length} sedes tocadas ===`);

    const docRows = await sql`
      with ultimo_evento as (
        select distinct on (expected_document_id) expected_document_id, status
        from review_events
        order by expected_document_id, created_at desc
      )
      select ed.institution_id, ed.section_id, ed.required,
        coalesce(ue.status, 'pendiente_revision') as estado,
        ds.name as apartado
      from expected_documents ed
      join document_sections ds on ds.id = ed.section_id
      left join ultimo_evento ue on ue.expected_document_id = ed.id
      where ed.institution_id = any(${sedes})
    `;

    const porCarpeta = new Map<string, { obligatorios: string[]; todos: string[] }>();
    for (const r of docRows) {
      const key = `${r.institution_id}|${r.apartado}`;
      const bucket = porCarpeta.get(key) ?? { obligatorios: [], todos: [] };
      bucket.todos.push(r.estado);
      if (r.required) bucket.obligatorios.push(r.estado);
      porCarpeta.set(key, bucket);
    }

    const countsByApartado = new Map<string, Record<string, number>>();
    for (const [key, { obligatorios, todos }] of porCarpeta) {
      const apartado = key.split("|")[1];
      const status = deriveApartadoStatus(obligatorios.length > 0 ? obligatorios : todos);
      const counts = countsByApartado.get(apartado) ?? {};
      counts[status] = (counts[status] ?? 0) + 1;
      countsByApartado.set(apartado, counts);
    }

    const apartados = [...countsByApartado.keys()].sort();
    for (const apartado of apartados) {
      const counts = countsByApartado.get(apartado)!;
      const parts = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ");
      console.log(`  ${apartado}: ${parts}`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
