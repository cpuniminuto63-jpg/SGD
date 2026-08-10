import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { toCsv } from "@/lib/export/to-csv";
import { toSgdStatus } from "@/lib/export/sgd-status-adapter";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";

export const dynamic = "force-dynamic";

// Contrato externo de integración con la app SGD legacy (sección 14 del prompt maestro).
// Nombres de columna EXACTOS, sin tildes, en este orden — no modificar sin coordinar
// con el equipo dueño de la app SGD.
interface CalidadSgdRow {
  Coordinador: string | null;
  Departamento: string;
  Municipio: string;
  Institucion: string;
  Sede: string;
  DANE_sede: string;
  Mentor: string | null;
  Linea: string;
  Actor: string | null;
  Sesion: string | null;
  Documento: string;
  Estado_calidad: string;
  Observacion_SGD: string | null;
  Fuente_SGD: string;
}

const COLUMNS: { key: keyof CalidadSgdRow; header: string }[] = (
  [
    "Coordinador",
    "Departamento",
    "Municipio",
    "Institucion",
    "Sede",
    "DANE_sede",
    "Mentor",
    "Linea",
    "Actor",
    "Sesion",
    "Documento",
    "Estado_calidad",
    "Observacion_SGD",
    "Fuente_SGD",
  ] as const
).map((key) => ({ key, header: key }));

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
            sql`select * from vw_estado_actual_documentos where institution_id = any(${institutionIds}::uuid[])`
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

  const sgdRows: CalidadSgdRow[] = rows.map((row) => ({
    Coordinador: row.coordinador,
    Departamento: row.departamento,
    Municipio: row.municipio,
    Institucion: row.institucion,
    Sede: row.sede,
    DANE_sede: row.dane_sede,
    Mentor: row.mentor,
    Linea: row.linea,
    Actor: row.actor,
    Sesion: row.sesion,
    Documento: row.evidencia,
    Estado_calidad: toSgdStatus(row.estado_actual),
    Observacion_SGD: row.ultima_observacion,
    Fuente_SGD: "RevisaSGD",
  }));

  const csv = toCsv(sgdRows, COLUMNS);
  const fileName = `calidad_documental_detalle_${todayStamp()}.csv`;

  await recordExportRun({
    exportType: "calidad_documental_detalle",
    fileName,
    generatedBy: auth.profile.id,
    rowCount: rows.length,
  });

  // BOM UTF-8 para que Excel abra tildes/ñ correctamente.
  const body = "﻿" + csv;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
