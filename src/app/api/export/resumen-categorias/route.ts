import * as XLSX from "xlsx";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { sanitizeRow } from "@/lib/export/sanitize-cell";
import { getResumenCategoriasReport } from "@/lib/resumen-categorias-report";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador", "sgd", "coordinador_eafit");
  if (auth.response) return auth.response;

  let report;
  try {
    const ids = await visibleInstitutionIds(auth.profile);
    report = await getResumenCategoriasReport(ids);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

  const consolidadoRows = report.consolidado.map((r) =>
    sanitizeRow({ Categoría: r.categoria, Cantidad: r.cantidad })
  );

  const detalleRows = report.detalle.map((r) =>
    sanitizeRow({
      "ID sede": r.sourceRowId ?? "",
      "DANE sede": r.daneCode,
      Sede: r.sedeName,
      Institución: r.institutionName,
      Departamento: r.department,
      Municipio: r.municipality,
      Coordinador: r.coordinatorName ?? "",
      Mentor: r.mentorName ?? "",
      Revisor: r.reviewerName ?? "",
      "Estado general": r.estadoGeneral,
      "Aprobado por SGD": r.aprobadoSgd ? "Sí" : "",
      "Rechazado por SGD (sin reenviar)": r.rechazadoSgdSinReenviar ? "Sí" : "",
      "En segunda revisión de SGD": r.enSegundaRevisionSgd ? "Sí" : "",
      "Traslado EAFIT": r.trasladoEafit ? "Sí" : "",
      "Entregado a CPE": r.entregadoCpe ? "Sí" : "",
      "Re-revisión pendiente": r.reRevisionPendiente ? "Sí" : "",
    })
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(consolidadoRows), "Consolidado");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detalleRows), "Detalle individual");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `resumen_categorias_${todayStamp()}.xlsx`;

  await recordExportRun({
    exportType: "resumen_categorias",
    fileName,
    generatedBy: auth.profile.id,
    rowCount: report.detalle.length,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
