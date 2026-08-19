import * as XLSX from "xlsx";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { getTrasladadoSgdReport } from "@/lib/trasladado-sgd-report";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  let rows;
  try {
    rows = await getTrasladadoSgdReport();
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

  if (rows.length === 0) {
    return new Response("Todavía no hay sedes trasladadas a revisión SGD.", { status: 200 });
  }

  const sheetRows = rows.map((r) => ({
    "DANE sede": r.daneCode,
    Institución: r.institutionName,
    Sede: r.sedeName,
    Departamento: r.department,
    Municipio: r.municipality,
    Línea: r.linea,
    Revisor: r.revisor,
    "Fecha de traslado a SGD": r.fechaTraslado.toLocaleString("es-CO"),
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trasladado a SGD");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `trasladado_a_sgd_${todayStamp()}.xlsx`;

  await recordExportRun({
    exportType: "trasladado_a_sgd",
    fileName,
    generatedBy: auth.profile.id,
    rowCount: rows.length,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
