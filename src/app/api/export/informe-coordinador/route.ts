import * as XLSX from "xlsx";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions } from "@/lib/db/schema";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";

export const dynamic = "force-dynamic";

/* A pedido del usuario (2026-08-20): el informe se arma a partir del campo
 * institutions.coordinator_name (el "coordinador" original de la hoja maestra
 * BASE_UNIFICADA — 4 valores fijos que cubren las 306 sedes), no de las
 * asignaciones de los 14 revisores. Mapeo confirmado por el usuario:
 *   ANGÉLICA -> Andrea · VIVIANA -> Patricia (Bernal) · SERGIO -> Alexandra ·
 *   MARIA E -> María Elisa (Rojas Estrada) */
const PERSONA_POR_ALIAS: Record<string, string> = {
  "ANGÉLICA": "Andrea",
  "VIVIANA": "Patricia",
  "SERGIO": "Alexandra",
  "MARIA E": "María Elisa",
};

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  let workbook: XLSX.WorkBook;
  let totalFilas = 0;
  try {
    const aliases = Object.keys(PERSONA_POR_ALIAS);
    const rows = await db
      .select({
        coordinatorName: institutions.coordinatorName,
        institutionId: institutions.id,
        sedeName: institutions.sedeName,
        institutionName: institutions.institutionName,
        daneCode: institutions.daneCode,
        municipality: institutions.municipality,
        department: institutions.department,
        linea: institutions.linea,
      })
      .from(institutions)
      .where(inArray(institutions.coordinatorName, aliases));

    const allInstitutionIds = rows.map((r) => r.institutionId);
    const overallStatusMap = await getSedeOverallStatusMap(allInstitutionIds.length > 0 ? allInstitutionIds : null);

    workbook = XLSX.utils.book_new();

    for (const alias of aliases) {
      const persona = PERSONA_POR_ALIAS[alias];
      const mine = rows
        .filter((r) => r.coordinatorName === alias)
        .sort((a, b) => a.sedeName.localeCompare(b.sedeName));

      const sheetRows = mine.map((r) => {
        const status = overallStatusMap.get(r.institutionId) ?? "sin_revisar";
        return {
          Sede: r.sedeName,
          Institución: r.institutionName,
          "DANE sede": r.daneCode,
          Municipio: r.municipality,
          Departamento: r.department,
          Línea: r.linea,
          "Estado general": SEDE_OVERALL_STATUS_META[status].label,
        };
      });
      totalFilas += sheetRows.length;

      const sheet = XLSX.utils.json_to_sheet(
        sheetRows.length > 0
          ? sheetRows
          : [{ Sede: "Sin sedes asignadas", Institución: "", "DANE sede": "", Municipio: "", Departamento: "", Línea: "", "Estado general": "" }]
      );
      const sheetName = persona.slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return new Response(
      `No se pudo generar la exportación: la base de datos no está conectada todavía (${message}).`,
      { status: 503 }
    );
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fileName = `informe_coordinadores_${todayStamp()}.xlsx`;

  await recordExportRun({
    exportType: "informe_coordinador_seleccionado",
    fileName,
    generatedBy: auth.profile.id,
    rowCount: totalFilas,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
