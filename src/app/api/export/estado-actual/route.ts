import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";

export const dynamic = "force-dynamic";

// Orden y encabezados en español para "Matriz de estado actual".
const COLUMNS: { key: keyof EstadoActualRow; header: string }[] = [
  { key: "coordinador", header: "Coordinador" },
  { key: "departamento", header: "Departamento" },
  { key: "municipio", header: "Municipio" },
  { key: "institucion", header: "Institución" },
  { key: "sede", header: "Sede" },
  { key: "dane_sede", header: "DANE sede" },
  { key: "mentor", header: "Mentor" },
  { key: "linea", header: "Línea" },
  { key: "apartado", header: "Apartado" },
  { key: "actor", header: "Actor" },
  { key: "sesion", header: "Sesión" },
  { key: "evidencia", header: "Evidencia" },
  { key: "obligatorio", header: "Obligatorio" },
  { key: "estado_actual", header: "Estado actual" },
  { key: "ultima_observacion", header: "Última observación" },
  { key: "numero_revisiones", header: "N° revisiones" },
  { key: "ultimo_revisor", header: "Último revisor" },
  { key: "fecha_primera_revision", header: "Fecha primera revisión" },
  { key: "fecha_ultima_revision", header: "Fecha última revisión" },
  { key: "fecha_limite_subsanacion", header: "Fecha límite subsanación" },
  { key: "ruta_archivo", header: "Ruta archivo" },
];

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase.from("vw_estado_actual_documentos").select("*");

  if (error) {
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${error.message}).`,
      { status: 503 }
    );
  }

  const rows = (data ?? []) as unknown as EstadoActualRow[];
  if (rows.length === 0) {
    return new Response("No hay documentos para exportar todavía.", { status: 200 });
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
  XLSX.utils.book_append_sheet(workbook, worksheet, "Estado actual");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `matriz_estado_actual_${todayStamp()}.xlsx`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await recordExportRun(supabase, {
      exportType: "matriz_estado_actual",
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
