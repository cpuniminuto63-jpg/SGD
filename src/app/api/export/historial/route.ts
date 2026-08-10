import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import type { HistorialRevisionRow } from "@/lib/types/historial-row";

export const dynamic = "force-dynamic";

const COLUMNS: { key: keyof HistorialRevisionRow; header: string }[] = [
  { key: "sede", header: "Sede" },
  { key: "dane_sede", header: "DANE sede" },
  { key: "apartado", header: "Apartado" },
  { key: "actor", header: "Actor" },
  { key: "sesion", header: "Sesión" },
  { key: "evidencia", header: "Evidencia" },
  { key: "estado", header: "Estado" },
  { key: "observacion", header: "Observación" },
  { key: "tipo_hallazgo", header: "Tipo hallazgo" },
  { key: "requiere_subsanacion", header: "Requiere subsanación" },
  { key: "fecha_limite_subsanacion", header: "Fecha límite subsanación" },
  { key: "prioridad", header: "Prioridad" },
  { key: "revisor", header: "Revisor" },
  { key: "fecha_revision", header: "Fecha revisión" },
];

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase.from("vw_historial_revisiones").select("*");

  if (error) {
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${error.message}).`,
      { status: 503 }
    );
  }

  const rows = (data ?? []) as unknown as HistorialRevisionRow[];
  if (rows.length === 0) {
    return new Response("No hay revisiones registradas todavía.", { status: 200 });
  }

  const sheetRows = rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (const col of COLUMNS) record[col.header] = row[col.key];
    return record;
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetRows, {
    header: COLUMNS.map((c) => c.header),
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Historial de revisiones");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `historial_revisiones_${todayStamp()}.xlsx`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await recordExportRun(supabase, {
      exportType: "historial_revisiones",
      fileName,
      generatedBy: user.id,
      rowCount: rows.length,
    });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
