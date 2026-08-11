import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { visibleInstitutionIds, institutionIdInFilter } from "@/lib/authz/visible-institutions";
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

  let rows: EstadoActualRow[];
  try {
    const institutionIds = await visibleInstitutionIds(auth.profile);
    const result =
      institutionIds === null
        ? await db.execute(sql`select * from vw_estado_actual_documentos`)
        : await db.execute(
            sql`select * from vw_estado_actual_documentos where ${institutionIdInFilter(institutionIds)}`
          );
    rows = result as unknown as EstadoActualRow[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

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

  await recordExportRun({
    exportType: "matriz_estado_actual",
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
