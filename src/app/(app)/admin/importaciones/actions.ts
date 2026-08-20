"use server";

import { eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { imports, importErrors, institutions, documentSections, documentCatalog, expectedDocuments } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import type { ParsedInstitution, ImportRowError } from "@/lib/import/parse-institutions";
import type { ParsedCatalogEntry } from "@/lib/import/parse-catalog";
import { generateExpectedDocuments } from "@/lib/import/generate-expected-documents";

const INSERT_BATCH_SIZE = 1000;

export interface ImportActionResult {
  ok: boolean;
  message: string;
}

export async function importInstitutions(payload: {
  fileName: string;
  valid: ParsedInstitution[];
  errors: ImportRowError[];
}): Promise<ImportActionResult> {
  const profile = await requireRole("administrador");

  let importRow;
  try {
    [importRow] = await db
      .insert(imports)
      .values({ kind: "sedes", fileName: payload.fileName, uploadedBy: profile.id, status: "en_progreso" })
      .returning();
  } catch (err) {
    return {
      ok: false,
      message: `No se pudo iniciar el registro de importación: ${err instanceof Error ? err.message : "error desconocido"}.`,
    };
  }

  // Postgres no permite que ON CONFLICT DO UPDATE afecte la misma fila dos veces dentro
  // del mismo INSERT: si dos filas de origen comparten (dane_code, sede_name) exactos
  // (ver el DANE duplicado que ya detecta parseInstitutions), hay que quedarse con una
  // sola antes de insertar — la última del archivo gana, como en cualquier upsert normal.
  const rowsByKey = new Map(
    payload.valid.map((r) => [
      `${r.daneCode}|${r.sedeName}`,
      {
        daneCode: r.daneCode,
        sedeName: r.sedeName,
        institutionName: r.institutionName,
        department: r.department,
        municipality: r.municipality,
        linea: r.linea,
        coordinatorName: r.coordinatorName,
        mentorName: r.mentorName,
        mentorIdentifier: r.mentorIdentifier,
        sessionsRaw: r.sessionsRaw,
        sessionsNormalized: r.linea,
        sourceImportId: importRow.id,
      },
    ])
  );
  const rows = [...rowsByKey.values()];

  let upsertError: string | null = null;
  if (rows.length > 0) {
    try {
      await db
        .insert(institutions)
        .values(rows)
        .onConflictDoUpdate({
          target: [institutions.daneCode, institutions.sedeName],
          set: {
            institutionName: sql`excluded.institution_name`,
            department: sql`excluded.department`,
            municipality: sql`excluded.municipality`,
            linea: sql`excluded.linea`,
            coordinatorName: sql`excluded.coordinator_name`,
            mentorName: sql`excluded.mentor_name`,
            mentorIdentifier: sql`excluded.mentor_identifier`,
            sessionsRaw: sql`excluded.sessions_raw`,
            sessionsNormalized: sql`excluded.sessions_normalized`,
            sourceImportId: sql`excluded.source_import_id`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      upsertError = err instanceof Error ? err.message : "error desconocido";
    }
  }

  if (payload.errors.length > 0) {
    await db.insert(importErrors).values(
      payload.errors.map((e) => ({
        importId: importRow.id,
        rowNumber: e.rowNumber > 0 ? e.rowNumber : null,
        errorType: e.errorType,
        details: e.details,
      }))
    );
  }

  const status = upsertError
    ? "fallido"
    : payload.errors.length > 0
      ? "completado_con_errores"
      : "completado";

  await db
    .update(imports)
    .set({
      status,
      summary: {
        validos: payload.valid.length,
        rechazados: payload.errors.length,
      },
      completedAt: new Date(),
    })
    .where(eq(imports.id, importRow.id));

  if (upsertError) {
    return { ok: false, message: `Falló la carga de sedes: ${upsertError}` };
  }

  return {
    ok: true,
    message: `Importación completada: ${payload.valid.length} sedes procesadas, ${payload.errors.length} filas con observaciones.`,
  };
}

export async function importCatalog(payload: {
  fileName: string;
  entries: ParsedCatalogEntry[];
  ambiguousRows: number[];
}): Promise<ImportActionResult> {
  const profile = await requireRole("administrador");

  let importRow;
  try {
    [importRow] = await db
      .insert(imports)
      .values({ kind: "catalogo", fileName: payload.fileName, uploadedBy: profile.id, status: "en_progreso" })
      .returning();
  } catch (err) {
    return {
      ok: false,
      message: `No se pudo iniciar el registro de importación: ${err instanceof Error ? err.message : "error desconocido"}.`,
    };
  }

  const sectionCodes = [...new Set(payload.entries.map((e) => e.sectionCode))];

  let existingSections;
  try {
    existingSections =
      sectionCodes.length > 0
        ? await db
            .select({ id: documentSections.id, code: documentSections.code })
            .from(documentSections)
            .where(inArray(documentSections.code, sectionCodes))
        : [];
  } catch (err) {
    return {
      ok: false,
      message: `No se pudieron leer las subsecciones existentes: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  const sectionIdByCode = new Map(existingSections.map((s) => [s.code, s.id]));
  const missingSections = sectionCodes.filter((code) => !sectionIdByCode.has(code));

  if (missingSections.length > 0) {
    let createdSections;
    try {
      createdSections = await db
        .insert(documentSections)
        .values(
          missingSections.map((code) => ({
            code,
            name: code.replace(/_/g, " "),
            actor: payload.entries.find((e) => e.sectionCode === code)?.actor ?? null,
          }))
        )
        .returning({ id: documentSections.id, code: documentSections.code });
    } catch (err) {
      return {
        ok: false,
        message: `No se pudieron crear las subsecciones: ${err instanceof Error ? err.message : "error desconocido"}`,
      };
    }
    for (const s of createdSections) sectionIdByCode.set(s.code, s.id);
  }

  const catalogRows = payload.entries.map((entry) => ({
    sectionId: sectionIdByCode.get(entry.sectionCode)!,
    evidenceName: entry.evidenceName,
    description: entry.sectionDescription,
    required: entry.required,
    allowedExtensions: entry.allowedExtensions,
    allowedNamingPatterns: entry.allowedNamingPatterns,
    sourceImportId: importRow.id,
  }));

  let catalogInsertError: string | null = null;
  if (catalogRows.length > 0) {
    try {
      await db.insert(documentCatalog).values(catalogRows);
    } catch (err) {
      catalogInsertError = err instanceof Error ? err.message : "error desconocido";
    }
  }

  const status = catalogInsertError
    ? "fallido"
    : payload.ambiguousRows.length > 0
      ? "completado_con_errores"
      : "completado";

  if (payload.ambiguousRows.length > 0) {
    await db.insert(importErrors).values(
      payload.ambiguousRows.map((rowNumber) => ({
        importId: importRow.id,
        rowNumber,
        errorType: "regla_ambigua_pendiente_parametrizacion",
        details: {},
      }))
    );
  }

  await db
    .update(imports)
    .set({
      status,
      summary: { entradas: payload.entries.length, ambiguas: payload.ambiguousRows.length },
      completedAt: new Date(),
    })
    .where(eq(imports.id, importRow.id));

  if (catalogInsertError) {
    return { ok: false, message: `Falló la carga del catálogo: ${catalogInsertError}` };
  }

  return {
    ok: true,
    message: `Catálogo importado: ${payload.entries.length} entradas (${payload.ambiguousRows.length} pendientes de parametrización).`,
  };
}

export async function generateAllExpectedDocuments(): Promise<ImportActionResult> {
  await requireRole("administrador");

  let institutionsList;
  try {
    institutionsList = await db
      .select({ id: institutions.id, linea: institutions.linea })
      .from(institutions)
      .where(eq(institutions.active, true));
  } catch (err) {
    return { ok: false, message: `No se pudieron leer las sedes: ${err instanceof Error ? err.message : "error desconocido"}` };
  }
  if (institutionsList.length === 0) {
    return { ok: false, message: "No hay sedes importadas todavía. Importa primero la base de sedes." };
  }

  let catalog;
  try {
    catalog = await db
      .select({
        id: documentCatalog.id,
        sectionId: documentCatalog.sectionId,
        required: documentCatalog.required,
        perSession: documentCatalog.perSession,
      })
      .from(documentCatalog)
      .where(isNull(documentCatalog.validTo));
  } catch (err) {
    return { ok: false, message: `No se pudo leer el catálogo: ${err instanceof Error ? err.message : "error desconocido"}` };
  }
  if (catalog.length === 0) {
    return { ok: false, message: "No hay catálogo documental importado todavía." };
  }

  // El actor vive en document_sections (asignado al crear la subsección durante la
  // importación del catálogo), no en document_catalog: se resuelve aquí con un join en memoria.
  let sections;
  try {
    sections = await db.select({ id: documentSections.id, actor: documentSections.actor }).from(documentSections);
  } catch (err) {
    return { ok: false, message: `No se pudieron leer las subsecciones: ${err instanceof Error ? err.message : "error desconocido"}` };
  }

  const actorBySectionId = new Map(sections.map((s) => [s.id, s.actor]));

  const rows = generateExpectedDocuments(
    institutionsList.map((i) => ({ id: i.id, linea: i.linea })),
    catalog.map((c) => ({
      id: c.id,
      sectionId: c.sectionId,
      actor: actorBySectionId.get(c.sectionId) ?? null,
      required: c.required,
      perSession: c.perSession,
    }))
  );

  const insertRows = rows.map((r) => ({
    institutionId: r.institution_id,
    sectionId: r.section_id,
    actor: r.actor,
    sessionNormalized: r.session_normalized,
    sessionNumber: r.session_number,
    documentCatalogId: r.document_catalog_id,
    required: r.required,
  }));

  for (let i = 0; i < insertRows.length; i += INSERT_BATCH_SIZE) {
    const batch = insertRows.slice(i, i + INSERT_BATCH_SIZE);
    try {
      await db.insert(expectedDocuments).values(batch);
    } catch (err) {
      return {
        ok: false,
        message:
          `Falló al generar documentos esperados en el lote ${i / INSERT_BATCH_SIZE + 1}: ${
            err instanceof Error ? err.message : "error desconocido"
          }. ` +
          "Si ya habías generado documentos esperados antes, esto es esperado (evita duplicados); no se necesita volver a generarlos salvo que hayas reimportado sedes o catálogo nuevos.",
      };
    }
  }

  return {
    ok: true,
    message: `Se generaron ${insertRows.length} documentos esperados para ${institutionsList.length} sedes y ${catalog.length} entradas de catálogo.`,
  };
}
