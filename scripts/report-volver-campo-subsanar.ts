/* Sedes con carpetas en "Volver a campo" y en "Pendiente por subsanar", con el
 * detalle de qué documentos obligatorios son los que están causando ese estado.
 * Uso: POSTGRES_URL=... npx tsx scripts/report-volver-campo-subsanar.ts
 */
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta POSTGRES_URL");
  process.exit(1);
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente de revisión",
  no_esta: "No hay documentación",
  pendiente_subsanar: "Pendiente por subsanar",
  volver_a_campo: "Volver a campo",
  cumple: "Cumple",
};

async function main() {
  const sql = postgres(connectionString!, { max: 1, prepare: false });

  const docRows = await sql`
    with ultimo_evento as (
      select distinct on (expected_document_id) expected_document_id, status, observation
      from review_events
      order by expected_document_id, created_at desc
    )
    select ed.institution_id, ed.section_id, ed.required, ed.id as expected_document_id,
      coalesce(ue.status, 'pendiente_revision') as estado, ue.observation,
      ds.name as apartado, i.sede_name, i.dane_code, dc.evidence_name
    from expected_documents ed
    join document_sections ds on ds.id = ed.section_id
    join institutions i on i.id = ed.institution_id
    join document_catalog dc on dc.id = ed.document_catalog_id
    left join ultimo_evento ue on ue.expected_document_id = ed.id
    where exists (
      select 1 from review_events re where re.expected_document_id = ed.id
    ) or ed.institution_id in (
      select distinct ed2.institution_id from expected_documents ed2
      join review_events re2 on re2.expected_document_id = ed2.id
    )
  `;

  function deriveApartadoStatus(statuses: string[]): string {
    if (statuses.length === 0) return "pendiente_revision";
    if (statuses.includes("volver_a_campo")) return "volver_a_campo";
    if (statuses.some((s) => s === "no_esta" || s === "pendiente_subsanar")) return "pendiente_subsanar";
    if (statuses.includes("pendiente_revision")) return "pendiente_revision";
    return "cumple";
  }

  const porCarpeta = new Map<string, { obligatorios: typeof docRows; todos: typeof docRows }>();
  for (const r of docRows) {
    const key = `${r.institution_id}|${r.section_id}`;
    const bucket = porCarpeta.get(key) ?? { obligatorios: [], todos: [] };
    bucket.todos.push(r);
    if (r.required) bucket.obligatorios.push(r);
    porCarpeta.set(key, bucket);
  }

  const volverACampo: { sede: string; dane: string; apartado: string; docs: string[] }[] = [];
  const pendienteSubsanar: { sede: string; dane: string; apartado: string; docs: { evidencia: string; estado: string; obs: string | null }[] }[] = [];

  for (const [, { obligatorios, todos }] of porCarpeta) {
    const base = obligatorios.length > 0 ? obligatorios : todos;
    const status = deriveApartadoStatus(base.map((d) => d.estado));
    if (status === "volver_a_campo") {
      const causantes = base.filter((d) => d.estado === "volver_a_campo").map((d) => d.evidence_name);
      volverACampo.push({ sede: base[0].sede_name, dane: base[0].dane_code, apartado: base[0].apartado, docs: causantes });
    } else if (status === "pendiente_subsanar") {
      const causantes = base
        .filter((d) => d.estado === "no_esta" || d.estado === "pendiente_subsanar")
        .map((d) => ({ evidencia: d.evidence_name, estado: ESTADO_LABEL[d.estado], obs: d.observation }));
      pendienteSubsanar.push({ sede: base[0].sede_name, dane: base[0].dane_code, apartado: base[0].apartado, docs: causantes });
    }
  }

  console.log(`=== VOLVER A CAMPO (${volverACampo.length} carpetas) ===`);
  for (const v of volverACampo.sort((a, b) => a.sede.localeCompare(b.sede))) {
    console.log(`${v.sede} (DANE ${v.dane}) — ${v.apartado}: ${v.docs.join(" | ")}`);
  }

  console.log(`\n=== PENDIENTE POR SUBSANAR (${pendienteSubsanar.length} carpetas) ===`);
  for (const p of pendienteSubsanar.sort((a, b) => a.sede.localeCompare(b.sede))) {
    console.log(`${p.sede} (DANE ${p.dane}) — ${p.apartado}:`);
    for (const d of p.docs) {
      console.log(`    - ${d.evidencia} [${d.estado}]${d.obs ? ` — "${d.obs}"` : ""}`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
