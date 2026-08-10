import { createClient } from "@/lib/supabase/server";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await recordExportRun(supabase, {
      exportType: "calidad_documental_detalle",
      fileName,
      generatedBy: user.id,
      rowCount: rows.length,
    });
  }

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
