/* Script de verificación manual (no forma parte del build). Ejecutar con:
 *   npx tsx scripts/smoke-test-import.ts <ruta_base_unificada.xlsx> <ruta_catalogo.xlsx>
 * o definiendo las variables de entorno BASE_UNIFICADA_XLSX / CATALOGO_XLSX.
 * Valida los parsers contra los archivos fuente reales sin tocarlos ni escribir nada.
 */
import XLSX from "xlsx";
import { parseInstitutions } from "../src/lib/import/parse-institutions";
import { parseCatalog } from "../src/lib/import/parse-catalog";
import { reconcileTotalSessions } from "../src/lib/import/session-rules";
import type { LineaCPE } from "../src/lib/supabase/database.types";

const BASE_UNIFICADA_PATH = process.argv[2] ?? process.env.BASE_UNIFICADA_XLSX;
const CATALOG_PATH = process.argv[3] ?? process.env.CATALOGO_XLSX;

if (!BASE_UNIFICADA_PATH || !CATALOG_PATH) {
  console.error(
    "Uso: npx tsx scripts/smoke-test-import.ts <base_unificada.xlsx> <catalogo.xlsx>\n" +
      "(o define BASE_UNIFICADA_XLSX / CATALOGO_XLSX como variables de entorno)"
  );
  process.exit(1);
}

function loadRows(path: string, sheetName?: string): unknown[][] {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[sheetName ?? wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
}

// --- Sedes ---
const institutionRows = loadRows(BASE_UNIFICADA_PATH).slice(2);
const institutionsResult = parseInstitutions(institutionRows);

console.log("=== SEDES ===");
console.log("válidas:", institutionsResult.valid.length);
console.log("errores:", institutionsResult.errors.length);
console.log("DANE duplicados:", institutionsResult.duplicateDaneCodes);
console.log(
  "mentores sin identificación:",
  institutionsResult.errors.filter((e) => e.errorType === "mentor_sin_identificacion").length
);
console.log("muestra DANE (deben verse enteros, sin notación científica):");
institutionsResult.valid.slice(0, 3).forEach((r) => console.log(" -", r.daneCode, r.sedeName));

const countByLinea = { L1: 0, L2: 0, L3: 0 } as Record<LineaCPE, number>;
institutionsResult.valid.forEach((r) => {
  countByLinea[r.linea] += 1;
});
console.log("conteo por línea:", countByLinea);

const reconciliation = reconcileTotalSessions(countByLinea);
console.log("RECONCILIACIÓN 6.696:", reconciliation);

// --- Catálogo documental ---
const catalogRows = loadRows(CATALOG_PATH).slice(2);
const catalogResult = parseCatalog(catalogRows);

console.log("\n=== CATÁLOGO DOCUMENTAL ===");
console.log("entradas generadas:", catalogResult.entries.length);
console.log("filas ambiguas (pendiente_parametrizacion):", catalogResult.ambiguousRows);
const sectionsSeen = [...new Set(catalogResult.entries.map((e) => e.sectionCode))];
console.log("subsecciones detectadas:", sectionsSeen);
const perActor = catalogResult.entries.filter((e) => e.actor);
console.log("entradas con actor (07-10 separadas):", perActor.length);
console.log(
  "muestra sin extensión detectada:",
  catalogResult.entries.filter((e) => e.allowedExtensions.length === 0).map((e) => e.evidenceName)
);

if (institutionsResult.valid.length !== 306) {
  console.error("❌ Se esperaban 306 sedes válidas, se obtuvieron", institutionsResult.valid.length);
  process.exitCode = 1;
}
if (!reconciliation.matchesExpected) {
  console.error("❌ La reconciliación de sesiones no coincide con 6.696");
  process.exitCode = 1;
}
