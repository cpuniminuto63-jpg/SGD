import * as XLSX from "xlsx";
import { sql, inArray, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, sectionReviews, documentSections } from "@/lib/db/schema";
import { institutionIdInFilter } from "@/lib/authz/visible-institutions";
import { requireExportRole } from "@/lib/export/require-export-role";
import { recordExportRun, todayStamp } from "@/lib/export/record-export-run";
import { getSedeOverallStatusMap, SEDE_OVERALL_STATUS_META } from "@/lib/sede-status";
import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";

export const dynamic = "force-dynamic";

/* A pedido del usuario (2026-08-20): el informe se arma a partir del campo
 * institutions.coordinator_name (el "coordinador" original de la hoja maestra
 * BASE_UNIFICADA — 4 valores fijos que cubren las 306 sedes), no de las
 * asignaciones de los 14 revisores. Mapeo confirmado por el usuario:
 *   ANGÉLICA -> Andrea · VIVIANA -> Patricia (Bernal) · SERGIO -> Alexandra ·
 *   MARIA E -> María Elisa (Rojas Estrada)
 * Cada persona recibe 3 hojas: Resumen (estado general por sede), Carpetas
 * (comentario general del último veredicto por apartado) y Documentos (estado y
 * comentario de cada documento individual). */
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
    let aliases = Object.keys(PERSONA_POR_ALIAS);

    // Un coordinador solo debe ver su propia hoja, no las de las otras 3 personas.
    // Se restringe según qué alias(es) tiene vinculados en institutions.coordinator_profile_id
    // (ver scripts/promote-to-coordinador.ts). El administrador sigue viendo las 4.
    if (auth.profile.role === "coordinador") {
      const misAliases = await db
        .selectDistinct({ coordinatorName: institutions.coordinatorName })
        .from(institutions)
        .where(eq(institutions.coordinatorProfileId, auth.profile.id));
      aliases = aliases.filter((a) => misAliases.some((m) => m.coordinatorName === a));
    }

    if (aliases.length === 0) {
      return new Response(
        "Tu cuenta no está vinculada a ninguna de las coordinaciones de este informe.",
        { status: 200 }
      );
    }

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

    if (rows.length === 0) {
      return new Response(
        "No se encontró ninguna sede con esos coordinadores (ANGÉLICA/VIVIANA/SERGIO/MARIA E) — revisa si la base de sedes cambió.",
        { status: 200 }
      );
    }

    const allInstitutionIds = rows.map((r) => r.institutionId);
    const sedeNameById = new Map(rows.map((r) => [r.institutionId, r.sedeName]));

    const [overallStatusMap, sectionReviewRows, sections, documentRows] = await Promise.all([
      getSedeOverallStatusMap(allInstitutionIds),
      db
        .select({
          institutionId: sectionReviews.institutionId,
          sectionId: sectionReviews.sectionId,
          status: sectionReviews.status,
          comment: sectionReviews.comment,
          createdAt: sectionReviews.createdAt,
        })
        .from(sectionReviews)
        .where(inArray(sectionReviews.institutionId, allInstitutionIds))
        .orderBy(desc(sectionReviews.createdAt)),
      db.select({ id: documentSections.id, name: documentSections.name }).from(documentSections),
      db
        .execute(sql`select * from vw_estado_actual_documentos where ${institutionIdInFilter(allInstitutionIds)}`)
        .then((r) => r as unknown as EstadoActualRow[]),
    ]);

    const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
    // sectionReviewRows viene desc por fecha: la primera vez que vemos una pareja
    // (sede, apartado) es su veredicto vigente.
    const latestPorCarpeta = new Map<string, (typeof sectionReviewRows)[number]>();
    for (const r of sectionReviewRows) {
      const key = `${r.institutionId}|${r.sectionId}`;
      if (!latestPorCarpeta.has(key)) latestPorCarpeta.set(key, r);
    }

    workbook = XLSX.utils.book_new();

    for (const alias of aliases) {
      const persona = PERSONA_POR_ALIAS[alias];
      const mineIds = new Set(rows.filter((r) => r.coordinatorName === alias).map((r) => r.institutionId));
      const mine = rows.filter((r) => mineIds.has(r.institutionId)).sort((a, b) => a.sedeName.localeCompare(b.sedeName));

      // Hoja 1: resumen por sede.
      const resumenRows = mine.map((r) => {
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
      totalFilas += resumenRows.length;
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(resumenRows.length > 0 ? resumenRows : [{ Sede: "Sin sedes asignadas" }]),
        `${persona} - Resumen`.slice(0, 31)
      );

      // Hoja 2: comentario general vigente de cada carpeta (apartado) de cada sede.
      const carpetaRows: Record<string, string>[] = [];
      for (const [key, review] of latestPorCarpeta) {
        const [institutionId] = key.split("|");
        if (!mineIds.has(institutionId)) continue;
        carpetaRows.push({
          Sede: sedeNameById.get(institutionId) ?? "",
          Apartado: sectionNameById.get(review.sectionId) ?? review.sectionId,
          Estado: REVIEW_STATUS_META[review.status]?.label ?? review.status,
          Comentario: review.comment ?? "",
          Fecha: new Date(review.createdAt).toLocaleString("es-CO"),
        });
      }
      carpetaRows.sort((a, b) => a.Sede.localeCompare(b.Sede) || a.Apartado.localeCompare(b.Apartado));
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(carpetaRows.length > 0 ? carpetaRows : [{ Sede: "Sin veredictos de apartado todavía" }]),
        `${persona} - Carpetas`.slice(0, 31)
      );

      // Hoja 3: detalle por documento individual (estado y comentario).
      const docRows = documentRows
        .filter((d) => mineIds.has(d.institution_id))
        .map((d) => ({
          Sede: d.sede,
          Apartado: d.apartado,
          "Actor / Sesión": d.actor ? `${d.actor}${d.numero_sesion ? ` · sesión ${d.numero_sesion}` : ""}` : "General",
          Evidencia: d.evidencia,
          Estado: REVIEW_STATUS_META[d.estado_actual]?.label ?? d.estado_actual,
          Comentario: d.ultima_observacion ?? "",
          "Última revisión": d.fecha_ultima_revision ? new Date(d.fecha_ultima_revision).toLocaleDateString("es-CO") : "",
        }))
        .sort((a, b) => a.Sede.localeCompare(b.Sede) || a.Apartado.localeCompare(b.Apartado));
      totalFilas += docRows.length;
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(docRows.length > 0 ? docRows : [{ Sede: "Sin documentos todavía" }]),
        `${persona} - Documentos`.slice(0, 31)
      );
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
