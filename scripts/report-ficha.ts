/* Sedes revisadas cuya carpeta "13 FICHA PROY PLAN SOST" ya está en Cumple, con su
 * % de avance general y qué carpetas les faltan para pasar a SGD.
 * Uso: POSTGRES_URL=... npx tsx scripts/report-ficha.ts
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

  const docRows = await sql`
    with ultimo_evento as (
      select distinct on (expected_document_id) expected_document_id, status
      from review_events order by expected_document_id, created_at desc
    )
    select ed.institution_id, ed.section_id, ed.required, coalesce(ue.status, 'pendiente_revision') as estado,
      ds.name as apartado, i.sede_name, i.dane_code
    from expected_documents ed
    join document_sections ds on ds.id = ed.section_id
    join institutions i on i.id = ed.institution_id
    left join ultimo_evento ue on ue.expected_document_id = ed.id
    where ed.institution_id in (
      select distinct ed2.institution_id from expected_documents ed2 join review_events re2 on re2.expected_document_id = ed2.id
    )
  `;

  const porCarpeta = new Map<string, { obligatorios: string[]; todos: string[]; apartado: string }>();
  const sedeInfo = new Map<string, { sede: string; dane: string }>();
  for (const r of docRows) {
    sedeInfo.set(r.institution_id, { sede: r.sede_name, dane: r.dane_code });
    const key = `${r.institution_id}|${r.section_id}`;
    const b = porCarpeta.get(key) ?? { obligatorios: [], todos: [], apartado: r.apartado };
    b.todos.push(r.estado);
    if (r.required) b.obligatorios.push(r.estado);
    porCarpeta.set(key, b);
  }

  const statusPorSede = new Map<string, Record<string, string>>();
  for (const [key, b] of porCarpeta) {
    const [institutionId] = key.split("|");
    const status = deriveApartadoStatus(b.obligatorios.length > 0 ? b.obligatorios : b.todos);
    const m = statusPorSede.get(institutionId) ?? {};
    m[b.apartado] = status;
    statusPorSede.set(institutionId, m);
  }

  const resultado: { sede: string; dane: string; pct: number; total: number; cumple: number; faltantes: string[] }[] = [];
  for (const [institutionId, apartados] of statusPorSede) {
    if (apartados["13 FICHA PROY PLAN SOST"] !== "cumple") continue;
    const total = Object.keys(apartados).length;
    const cumple = Object.values(apartados).filter((s) => s === "cumple").length;
    const faltantes = Object.entries(apartados).filter(([, s]) => s !== "cumple").map(([a]) => a);
    const info = sedeInfo.get(institutionId)!;
    resultado.push({ sede: info.sede, dane: info.dane, pct: Math.round((cumple / total) * 100), total, cumple, faltantes });
  }

  resultado.sort((a, b) => b.pct - a.pct);
  console.log(`Sedes revisadas con Ficha de Proyecto/Plan Sostenibilidad en Cumple: ${resultado.length}\n`);
  for (const r of resultado) {
    console.log(`${r.sede} (DANE ${r.dane}): ${r.pct}% (${r.cumple}/${r.total}) — le faltan: ${r.faltantes.join(", ")}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
