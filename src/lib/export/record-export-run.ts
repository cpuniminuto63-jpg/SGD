import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Inserta una fila en `export_runs` dejando trazabilidad de qué se generó, quién y cuándo.
 * No lanza si falla el insert: un problema de auditoría no debe impedir la descarga del archivo.
 */
export async function recordExportRun(
  supabase: SupabaseClient<Database>,
  params: {
    exportType: string;
    fileName: string;
    generatedBy: string;
    filters?: Record<string, unknown>;
    rowCount: number;
  }
) {
  try {
    await supabase.from("export_runs").insert({
      export_type: params.exportType,
      file_name: params.fileName,
      generated_by: params.generatedBy,
      filters: params.filters ?? {},
      row_count: params.rowCount,
    });
  } catch {
    // No bloqueamos la descarga si falla el registro de auditoría.
  }
}

/** Fecha de hoy en formato YYYY-MM-DD, para incluir en el nombre del archivo. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
