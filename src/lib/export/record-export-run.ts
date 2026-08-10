import { db } from "@/lib/db/client";
import { exportRuns } from "@/lib/db/schema";

/**
 * Inserta una fila en `export_runs` dejando trazabilidad de qué se generó, quién y cuándo.
 * No lanza si falla el insert: un problema de auditoría no debe impedir la descarga del archivo.
 */
export async function recordExportRun(params: {
  exportType: string;
  fileName: string;
  generatedBy: string;
  filters?: Record<string, unknown>;
  rowCount: number;
}) {
  try {
    await db.insert(exportRuns).values({
      exportType: params.exportType,
      fileName: params.fileName,
      generatedBy: params.generatedBy,
      filters: params.filters ?? {},
      rowCount: params.rowCount,
    });
  } catch {
    // No bloqueamos la descarga si falla el registro de auditoría.
  }
}

/** Fecha de hoy en formato YYYY-MM-DD, para incluir en el nombre del archivo. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
