"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import type { ParsedInstitution, ImportRowError } from "@/lib/import/parse-institutions";
import type { ParsedCatalogEntry } from "@/lib/import/parse-catalog";

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
  const supabase = await createClient();

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({ kind: "sedes", file_name: payload.fileName, uploaded_by: profile.id, status: "en_progreso" })
    .select()
    .single();

  if (importError || !importRow) {
    return { ok: false, message: importError?.message ?? "No se pudo iniciar el registro de importación." };
  }

  const rows = payload.valid.map((r) => ({
    dane_code: r.daneCode,
    sede_name: r.sedeName,
    institution_name: r.institutionName,
    department: r.department,
    municipality: r.municipality,
    linea: r.linea,
    coordinator_name: r.coordinatorName,
    mentor_name: r.mentorName,
    mentor_identifier: r.mentorIdentifier,
    sessions_raw: r.sessionsRaw,
    sessions_normalized: r.linea,
    source_import_id: importRow.id as string,
  }));

  const { error: upsertError } = await supabase
    .from("institutions")
    .upsert(rows, { onConflict: "dane_code,sede_name" });

  if (payload.errors.length > 0) {
    await supabase.from("import_errors").insert(
      payload.errors.map((e) => ({
        import_id: importRow.id as string,
        row_number: e.rowNumber > 0 ? e.rowNumber : null,
        error_type: e.errorType,
        details: e.details,
      }))
    );
  }

  const status = upsertError
    ? "fallido"
    : payload.errors.length > 0
      ? "completado_con_errores"
      : "completado";

  await supabase
    .from("imports")
    .update({
      status,
      summary: {
        validos: payload.valid.length,
        rechazados: payload.errors.length,
      },
      completed_at: new Date().toISOString(),
    })
    .eq("id", importRow.id as string);

  if (upsertError) {
    return { ok: false, message: `Falló la carga de sedes: ${upsertError.message}` };
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
  const supabase = await createClient();

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({ kind: "catalogo", file_name: payload.fileName, uploaded_by: profile.id, status: "en_progreso" })
    .select()
    .single();

  if (importError || !importRow) {
    return { ok: false, message: importError?.message ?? "No se pudo iniciar el registro de importación." };
  }

  const sectionCodes = [...new Set(payload.entries.map((e) => e.sectionCode))];

  const { data: existingSections, error: sectionsSelectError } = await supabase
    .from("document_sections")
    .select("id, code")
    .in("code", sectionCodes);

  if (sectionsSelectError) {
    return { ok: false, message: `No se pudieron leer las subsecciones existentes: ${sectionsSelectError.message}` };
  }

  const sectionIdByCode = new Map((existingSections ?? []).map((s) => [s.code, s.id]));
  const missingSections = sectionCodes.filter((code) => !sectionIdByCode.has(code));

  if (missingSections.length > 0) {
    const { data: createdSections, error: createSectionsError } = await supabase
      .from("document_sections")
      .insert(
        missingSections.map((code) => ({
          code,
          name: code.replace(/_/g, " "),
          actor: payload.entries.find((e) => e.sectionCode === code)?.actor ?? null,
        }))
      )
      .select("id, code");

    if (createSectionsError) {
      return { ok: false, message: `No se pudieron crear las subsecciones: ${createSectionsError.message}` };
    }
    for (const s of createdSections ?? []) sectionIdByCode.set(s.code, s.id);
  }

  const catalogRows = payload.entries.map((entry) => ({
    section_id: sectionIdByCode.get(entry.sectionCode)!,
    evidence_name: entry.evidenceName,
    description: entry.sectionDescription,
    required: entry.required,
    allowed_extensions: entry.allowedExtensions,
    allowed_naming_patterns: entry.allowedNamingPatterns,
    source_import_id: importRow.id as string,
  }));

  const { error: catalogInsertError } = await supabase.from("document_catalog").insert(catalogRows);

  const status = catalogInsertError
    ? "fallido"
    : payload.ambiguousRows.length > 0
      ? "completado_con_errores"
      : "completado";

  if (payload.ambiguousRows.length > 0) {
    await supabase.from("import_errors").insert(
      payload.ambiguousRows.map((rowNumber) => ({
        import_id: importRow.id as string,
        row_number: rowNumber,
        error_type: "regla_ambigua_pendiente_parametrizacion",
        details: {},
      }))
    );
  }

  await supabase
    .from("imports")
    .update({
      status,
      summary: { entradas: payload.entries.length, ambiguas: payload.ambiguousRows.length },
      completed_at: new Date().toISOString(),
    })
    .eq("id", importRow.id as string);

  if (catalogInsertError) {
    return { ok: false, message: `Falló la carga del catálogo: ${catalogInsertError.message}` };
  }

  return {
    ok: true,
    message: `Catálogo importado: ${payload.entries.length} entradas (${payload.ambiguousRows.length} pendientes de parametrización).`,
  };
}
