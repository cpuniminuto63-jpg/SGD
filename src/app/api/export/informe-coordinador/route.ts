import * as XLSX from "xlsx";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, reviewerAssignments, institutions } from "@/lib/db/schema";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";

export const dynamic = "force-dynamic";

// A pedido del usuario (2026-08-19): informe solo para estas 4 personas, una hoja cada una.
const PERSONAS = ["Andrea", "María Elisa Rojas Estrada", "Patricia Bernal", "Alexandra"];

export async function GET() {
  const auth = await requireExportRole("administrador", "coordinador");
  if (auth.response) return auth.response;

  let workbook: XLSX.WorkBook;
  let totalFilas = 0;
  try {
    const targetProfiles = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
      .where(inArray(profiles.fullName, PERSONAS));

    const assignments = await db
      .select({
        profileId: reviewerAssignments.profileId,
        institutionId: reviewerAssignments.institutionId,
        sedeName: institutions.sedeName,
        institutionName: institutions.institutionName,
        daneCode: institutions.daneCode,
        municipality: institutions.municipality,
        department: institutions.department,
        linea: institutions.linea,
      })
      .from(reviewerAssignments)
      .innerJoin(institutions, eq(institutions.id, reviewerAssignments.institutionId))
      .where(
        inArray(
          reviewerAssignments.profileId,
          targetProfiles.map((p) => p.id)
        )
      );

    const allInstitutionIds = [...new Set(assignments.map((a) => a.institutionId))];
    const overallStatusMap = await getSedeOverallStatusMap(allInstitutionIds.length > 0 ? allInstitutionIds : null);

    workbook = XLSX.utils.book_new();

    for (const persona of targetProfiles) {
      const mine = assignments
        .filter((a) => a.profileId === persona.id)
        .sort((a, b) => a.sedeName.localeCompare(b.sedeName));

      const sheetRows = mine.map((a) => {
        const status = overallStatusMap.get(a.institutionId) ?? "sin_revisar";
        return {
          Sede: a.sedeName,
          Institución: a.institutionName,
          "DANE sede": a.daneCode,
          Municipio: a.municipality,
          Departamento: a.department,
          Línea: a.linea,
          "Estado general": SEDE_OVERALL_STATUS_META[status].label,
        };
      });
      totalFilas += sheetRows.length;

      const sheet = XLSX.utils.json_to_sheet(
        sheetRows.length > 0 ? sheetRows : [{ Sede: "Sin sedes asignadas", Institución: "", "DANE sede": "", Municipio: "", Departamento: "", Línea: "", "Estado general": "" }]
      );
      // Nombre de hoja de Excel: máx 31 caracteres, sin caracteres especiales problemáticos.
      const sheetName = persona.fullName.slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }

    if (targetProfiles.length === 0) {
      return new Response("No se encontraron cuentas con esos nombres.", { status: 200 });
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
