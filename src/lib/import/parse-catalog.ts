// Columnas de "matrix tipos documentales_vf4.xlsx", hoja ESTRUCTURA_DETALLE
// (fila de encabezado real, 0-indexed):
// 0 SUBSECCIÓN · 1 DESCRIPCIÓN DE EVIDENCIAS A CARGAR · 2 EVIDENCIA ESPECÍFICA A CARGAR ·
// 3 FORMATO / INSTRUMENTO EAFIT · 4 NOMENCLATURA · 5 OBLIGATORIO ("1"/"0")
//
// Particularidades reales del archivo (verificadas contra la fuente):
// - SUBSECCIÓN y DESCRIPCIÓN solo aparecen en la primera fila de cada grupo visual
//   de Excel; hay que propagarlas hacia abajo.
// - Las filas de la sección de sesiones por actor traen la celda de SUBSECCIÓN como
//   "07_ESTUDIANTES\n08_DOCENTES\n09_DIRECTIVOS\n10_FAMILIAS" (una sola celda combinada
//   visualmente): hay que separarla en 4 subsecciones/actores distintos.
// - No existe columna explícita de extensión: se infiere del texto de la evidencia
//   (ej. "Lista de asistencia física (PDF)").
// - NOMENCLATURA puede traer varias líneas = varias nomenclaturas válidas.
// - Al final de la hoja quedan filas vacías por el rango usado de Excel: se descartan.

import type { ActorTipo } from "@/lib/db/types";

const ACTOR_BY_SECTION_PREFIX: Record<string, ActorTipo> = {
  "07": "estudiantes",
  "08": "docentes",
  "09": "directivos",
  "10": "familias",
};

const EXTENSION_PATTERN = /\b(PDF|JPE?G|PNG|DOCX?|XLSX?|MP4|PPTX?)\b/gi;

export interface ParsedCatalogEntry {
  rowNumber: number;
  sectionCode: string;
  sectionDescription: string;
  actor: ActorTipo | null;
  evidenceName: string;
  instrumentReference: string;
  allowedExtensions: string[];
  allowedNamingPatterns: string[];
  required: boolean;
  ruleStatus: "activa" | "pendiente_parametrizacion";
}

export interface ParseCatalogResult {
  entries: ParsedCatalogEntry[];
  ambiguousRows: number[];
}

function cell(row: unknown[], index: number): string {
  return String(row[index] ?? "").trim();
}

function extractExtensions(evidenceText: string): string[] {
  const matches = [...evidenceText.matchAll(EXTENSION_PATTERN)].map((m) => m[1].toUpperCase());
  return [...new Set(matches.map((ext) => (ext === "JPEG" ? "JPG" : ext === "DOC" ? "DOC" : ext)))];
}

function splitNamingPatterns(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCatalog(dataRows: unknown[][], startRowNumber = 3): ParseCatalogResult {
  const entries: ParsedCatalogEntry[] = [];
  const ambiguousRows: number[] = [];

  let currentSectionCell = "";
  let currentDescription = "";

  dataRows.forEach((row, i) => {
    const rowNumber = startRowNumber + i;

    const sectionCellRaw = cell(row, 0);
    if (sectionCellRaw) currentSectionCell = sectionCellRaw;

    const descriptionRaw = cell(row, 1);
    if (descriptionRaw) currentDescription = descriptionRaw;

    const evidenceName = cell(row, 2);
    if (!evidenceName) return; // fila vacía de cola del rango usado por Excel

    const instrumentReference = cell(row, 3);
    const namingRaw = cell(row, 4);
    const requiredRaw = cell(row, 5);

    const sectionCodes = currentSectionCell
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const allowedExtensions = extractExtensions(evidenceName);
    const allowedNamingPatterns = splitNamingPatterns(namingRaw);

    let required: boolean;
    let ruleStatus: ParsedCatalogEntry["ruleStatus"] = "activa";
    if (requiredRaw === "1") {
      required = true;
    } else if (requiredRaw === "0") {
      required = false;
    } else {
      // Regla ambigua: no se asume "no aplica" ni "obligatorio" por defecto,
      // se marca explícitamente para parametrización administrativa.
      required = true;
      ruleStatus = "pendiente_parametrizacion";
      ambiguousRows.push(rowNumber);
    }

    for (const sectionCode of sectionCodes) {
      const prefix = sectionCode.slice(0, 2);
      entries.push({
        rowNumber,
        sectionCode,
        sectionDescription: currentDescription,
        actor: ACTOR_BY_SECTION_PREFIX[prefix] ?? null,
        evidenceName,
        instrumentReference,
        allowedExtensions,
        allowedNamingPatterns,
        required,
        ruleStatus,
      });
    }
  });

  return { entries, ambiguousRows };
}
