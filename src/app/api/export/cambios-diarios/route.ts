import * as XLSX from "xlsx";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { getReviewActivitySince, groupDailyByReviewer, groupDailyTotals } from "@/lib/review-timeline";

export const dynamic = "force-dynamic";

const SEGUIMIENTO_DESDE = new Date("2026-08-18T00:00:00.000Z");

function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  let activity;
  try {
    activity = await getReviewActivitySince(SEGUIMIENTO_DESDE);
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

  const totals = groupDailyTotals(activity);
  const byReviewer = groupDailyByReviewer(activity);

  const workbook = XLSX.utils.book_new();

  const resumenRows = totals.map((t) => ({
    Fecha: formatDay(t.day),
    "Cambios de estado": t.cambios,
    "Sedes distintas tocadas": t.sedesUnicas,
  }));
  const resumenSheet = XLSX.utils.json_to_sheet(
    resumenRows.length > 0 ? resumenRows : [{ Fecha: "Sin actividad todavía", "Cambios de estado": 0, "Sedes distintas tocadas": 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen diario");

  const detalleRows = byReviewer.map((r) => ({
    Fecha: formatDay(r.day),
    Revisor: r.reviewerName,
    "Cambios de estado": r.cambios,
    "Sedes distintas tocadas": r.sedesUnicas,
  }));
  const detalleSheet = XLSX.utils.json_to_sheet(
    detalleRows.length > 0 ? detalleRows : [{ Fecha: "Sin actividad todavía", Revisor: "—", "Cambios de estado": 0, "Sedes distintas tocadas": 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, detalleSheet, "Detalle por revisor");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fileName = `cambios_diarios_${todayStamp()}.xlsx`;

  await recordExportRun({
    exportType: "cambios_diarios",
    fileName,
    generatedBy: auth.profile.id,
    rowCount: activity.length,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
