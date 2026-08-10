import { normalizeLinea } from "@/lib/import/session-rules";
import type { LineaCPE } from "@/lib/supabase/database.types";

// Columnas de BASE_UNIFICADA_4_COORDINADORES (fila de encabezado real, 0-indexed):
// 0 COORDINADOR (HOJA) · 1 ID · 2 COD. DANE SEDE · 3 NOMBRE SEDE · 4 COD DANE EE ·
// 5 NOMBRE EE · 6 DEPARTAMENTO · 7 MUNICIPIO · 8 LINEA · 9 MENTOR · 10 ID MENTOR
// Los datos empiezan en la fila 3 del archivo (índice 2 del array, tras título + encabezado).

export interface ParsedInstitution {
  rowNumber: number;
  coordinatorName: string;
  sourceId: string;
  daneCode: string;
  sedeName: string;
  daneEE: string;
  institutionName: string;
  department: string;
  municipality: string;
  linea: LineaCPE;
  sessionsRaw: string;
  mentorName: string;
  mentorIdentifier: string | null;
}

export interface ImportRowError {
  rowNumber: number;
  errorType:
    | "dane_faltante"
    | "campo_obligatorio_faltante"
    | "linea_no_reconocida"
    | "mentor_sin_identificacion"
    | "dane_duplicado";
  details: Record<string, unknown>;
}

export interface ParseInstitutionsResult {
  valid: ParsedInstitution[];
  errors: ImportRowError[];
  duplicateDaneCodes: string[];
}

/** Convierte una celda de código DANE (puede venir como número en notación científica) a texto exacto. */
export function formatDaneCode(cell: unknown): string {
  if (typeof cell === "number") {
    // Los códigos DANE (≤ 12 dígitos) están muy por debajo de Number.MAX_SAFE_INTEGER,
    // así que Math.round no pierde precisión.
    return Math.round(cell).toString();
  }
  return String(cell ?? "").trim();
}

function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "").trim();
}

/**
 * Recibe las filas crudas (array de arrays) de la hoja BASE_UNIFICADA, ya sin las
 * dos filas de título/encabezado (es decir, a partir de la primera fila de datos).
 */
export function parseInstitutions(dataRows: unknown[][], startRowNumber = 3): ParseInstitutionsResult {
  const valid: ParsedInstitution[] = [];
  const errors: ImportRowError[] = [];
  const daneCount = new Map<string, number>();

  dataRows.forEach((row, i) => {
    const rowNumber = startRowNumber + i;
    const isBlank = row.every((v) => v === "" || v === null || v === undefined);
    if (isBlank) return;

    const coordinatorName = cell(row, 0);
    const sourceId = cell(row, 1);
    const daneCode = formatDaneCode(row[2]);
    const sedeName = cell(row, 3);
    const daneEE = formatDaneCode(row[4]);
    const institutionName = cell(row, 5);
    const department = cell(row, 6);
    const municipality = cell(row, 7);
    const lineaRaw = cell(row, 8);
    const mentorName = cell(row, 9);
    const mentorIdentifier = cell(row, 10);

    const missingRequired: string[] = [];
    if (!daneCode) missingRequired.push("COD. DANE SEDE");
    if (!sedeName) missingRequired.push("NOMBRE SEDE");
    if (!institutionName) missingRequired.push("NOMBRE EE");
    if (!department) missingRequired.push("DEPARTAMENTO");
    if (!municipality) missingRequired.push("MUNICIPIO");

    if (missingRequired.length > 0) {
      errors.push({
        rowNumber,
        errorType: "campo_obligatorio_faltante",
        details: { missingRequired, sedeName, daneCode },
      });
      return;
    }

    const { normalized: linea, original: sessionsRaw } = normalizeLinea(lineaRaw);
    if (!linea) {
      errors.push({
        rowNumber,
        errorType: "linea_no_reconocida",
        details: { lineaRaw, sedeName, daneCode },
      });
      return;
    }

    if (!mentorIdentifier) {
      errors.push({
        rowNumber,
        errorType: "mentor_sin_identificacion",
        details: { mentorName, sedeName, daneCode },
      });
      // No es bloqueante: se importa igual pero queda marcado para seguimiento administrativo.
    }

    daneCount.set(daneCode, (daneCount.get(daneCode) ?? 0) + 1);

    valid.push({
      rowNumber,
      coordinatorName,
      sourceId,
      daneCode,
      sedeName,
      daneEE,
      institutionName,
      department,
      municipality,
      linea,
      sessionsRaw,
      mentorName,
      mentorIdentifier: mentorIdentifier || null,
    });
  });

  const duplicateDaneCodes = [...daneCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([code]) => code);

  for (const code of duplicateDaneCodes) {
    errors.push({
      rowNumber: -1,
      errorType: "dane_duplicado",
      details: { daneCode: code, occurrences: daneCount.get(code) },
    });
  }

  return { valid, errors, duplicateDaneCodes };
}
