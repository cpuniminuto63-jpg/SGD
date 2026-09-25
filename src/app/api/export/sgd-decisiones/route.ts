import * as XLSX from "xlsx";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { sanitizeRow } from "@/lib/export/sanitize-cell";
import { getSgdDecisionesReport } from "@/lib/sgd-decisiones-report";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador", "sgd", "coordinador_eafit");
  if (auth.response) return auth.response;

  let rows;
  try {
    rows = await getSgdDecisionesReport();
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

  if (rows.length === 0) {
    return new Response("Todavía no hay sedes en la etapa de SGD.", { status: 200 });
  }

  const sheetRows = rows.map((r) =>
    sanitizeRow({
      "ID sede": r.sourceRowId ?? "",
      "DANE sede": r.daneCode,
      Sede: r.sedeName,
      Institución: r.institutionName,
      Departamento: r.department,
      Municipio: r.municipality,
      "Decisión SGD": r.decision,
      "Fecha decisión": r.decisionAt ? r.decisionAt.toLocaleString("es-CO") : "",
      "Decidido por": r.decisionBy ?? "",
      "Comentario de rechazo": r.rejectionComment ?? "",
      "Segunda revisión pedida": r.segundaRevisionRequestedAt ? r.segundaRevisionRequestedAt.toLocaleString("es-CO") : "",
      "Segunda revisión pedida por": r.segundaRevisionRequestedBy ?? "",
      "Traslado EAFIT": r.traspasoEafitAt ? r.traspasoEafitAt.toLocaleString("es-CO") : "",
      "Entregado a CPE": r.entregadoCpeAt ? r.entregadoCpeAt.toLocaleString("es-CO") : "",
    })
  );

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Decisiones SGD");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `decisiones_sgd_${todayStamp()}.xlsx`;

  await recordExportRun({
    exportType: "decisiones_sgd",
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
