/* Genera un Excel con el detalle de "Volver a campo" y "Pendiente por subsanar":
 * qué sedes, qué carpetas, y qué documentos concretos lo están causando.
 * Uso: POSTGRES_URL=... npx tsx scripts/report-volver-campo-subsanar-xlsx.ts <salida.xlsx>
 */
import XLSX from "xlsx";
import postgres from "postgres";

const [outputPath] = process.argv.slice(2);
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString || !outputPath) {
  console.error("Uso: POSTGRES_URL=... npx tsx scripts/report-volver-campo-subsanar-xlsx.ts <salida.xlsx>");
  process.exit(1);
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente de revisión",
  no_esta: "No hay documentación",
  pendiente_subsanar: "Pendiente por subsanar",
  volver_a_campo: "Volver a campo",
  cumple: "Cumple",
};

interface DocRow {
  institution_id: string;
  section_id: string;
  required: boolean;
  estado: string;
  observation: string | null;
  apartado: string;
  sede_name: string;
  dane_code: string;
  department: string;
  coordinator_name: string | null;
  evidence_name: string;
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

  const docRows = (await sql`
    with ultimo_evento as (
      select distinct on (expected_document_id) expected_document_id, status, observation
      from review_events
      order by expected_document_id, created_at desc
    )
    select ed.institution_id, ed.section_id, ed.required,
      coalesce(ue.status, 'pendiente_revision') as estado, ue.observation,
      ds.name as apartado, i.sede_name, i.dane_code, i.department, i.coordinator_name, dc.evidence_name
    from expected_documents ed
    join document_sections ds on ds.id = ed.section_id
    join institutions i on i.id = ed.institution_id
    join document_catalog dc on dc.id = ed.document_catalog_id
    left join ultimo_evento ue on ue.expected_document_id = ed.id
    where ed.institution_id in (
      select distinct ed2.institution_id from expected_documents ed2
      join review_events re2 on re2.expected_document_id = ed2.id
    )
  `) as unknown as DocRow[];

  const porCarpeta = new Map<string, DocRow[]>();
  for (const r of docRows) {
    const key = `${r.institution_id}|${r.section_id}`;
    const list = porCarpeta.get(key) ?? [];
    list.push(r);
    porCarpeta.set(key, list);
  }

  const volverACampo: Record<string, string>[] = [];
  const pendienteSubsanar: Record<string, string>[] = [];
  const resumenPorSede = new Map<
    string,
    { sede: string; dane: string; departamento: string; coordinacion: string; volverACampo: number; subsanar: number }
  >();

  for (const [, docs] of porCarpeta) {
    const obligatorios = docs.filter((d) => d.required);
    const base = obligatorios.length > 0 ? obligatorios : docs;
    const status = deriveApartadoStatus(base.map((d) => d.estado));
    const { sede_name: sede, dane_code: dane, department: departamento, coordinator_name: coordinacion, apartado } = docs[0];
    const key = `${sede}|${dane}`;
    const resumen = resumenPorSede.get(key) ?? { sede, dane, departamento, coordinacion: coordinacion ?? "", volverACampo: 0, subsanar: 0 };

    if (status === "volver_a_campo") {
      resumen.volverACampo++;
      for (const d of base.filter((d) => d.estado === "volver_a_campo")) {
        volverACampo.push({
          Sede: sede,
          "DANE sede": dane,
          Departamento: departamento,
          Coordinación: coordinacion ?? "",
          Apartado: apartado,
          Documento: d.evidence_name,
          Comentario: d.observation ?? "",
        });
      }
    } else if (status === "pendiente_subsanar") {
      resumen.subsanar++;
      for (const d of base.filter((d) => d.estado === "no_esta" || d.estado === "pendiente_subsanar")) {
        pendienteSubsanar.push({
          Sede: sede,
          "DANE sede": dane,
          Departamento: departamento,
          Coordinación: coordinacion ?? "",
          Apartado: apartado,
          Documento: d.evidence_name,
          Estado: ESTADO_LABEL[d.estado],
          Comentario: d.observation ?? "",
        });
      }
    }
    resumenPorSede.set(key, resumen);
  }

  const resumenRows = [...resumenPorSede.values()]
    .filter((r) => r.volverACampo > 0 || r.subsanar > 0)
    .sort((a, b) => b.subsanar + b.volverACampo - (a.subsanar + a.volverACampo))
    .map((r) => ({
      Sede: r.sede,
      "DANE sede": r.dane,
      Departamento: r.departamento,
      Coordinación: r.coordinacion,
      "Carpetas Volver a campo": r.volverACampo,
      "Carpetas Pendiente subsanar": r.subsanar,
    }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumenRows), "Resumen por sede");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(volverACampo.length > 0 ? volverACampo : [{ Sede: "Ninguna" }]),
    "Volver a campo"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(pendienteSubsanar.length > 0 ? pendienteSubsanar : [{ Sede: "Ninguna" }]),
    "Pendiente por subsanar"
  );
  XLSX.writeFile(workbook, outputPath);

  console.log(`Sedes con algo pendiente: ${resumenRows.length}`);
  console.log(`Filas Volver a campo: ${volverACampo.length}`);
  console.log(`Filas Pendiente por subsanar: ${pendienteSubsanar.length}`);
  console.log(`Guardado en: ${outputPath}`);

  await sql.end();
}

main().catch((err) => {
  console.error("✗ Falló:", err.message ?? err);
  process.exit(1);
});
