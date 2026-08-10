"use client";

import { useState, useTransition } from "react";
import { readWorkbookRows } from "@/lib/import/read-workbook";
import { parseCatalog, type ParseCatalogResult } from "@/lib/import/parse-catalog";
import { importCatalog, type ImportActionResult } from "@/app/(app)/admin/importaciones/actions";

export function CatalogImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseCatalogResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setParseError(null);
    setConfirmResult(null);
    setFileName(file.name);
    try {
      const rows = await readWorkbookRows(file, "ESTRUCTURA_DETALLE ");
      const dataRows = rows.slice(2);
      setResult(parseCatalog(dataRows));
    } catch (err) {
      setResult(null);
      setParseError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  function handleConfirm() {
    if (!result || !fileName) return;
    startTransition(async () => {
      const res = await importCatalog({
        fileName,
        entries: result.entries,
        ambiguousRows: result.ambiguousRows,
      });
      setConfirmResult(res);
    });
  }

  const sectionsSeen = result ? [...new Set(result.entries.map((e) => e.sectionCode))] : [];
  const withoutExtension = result?.entries.filter((e) => e.allowedExtensions.length === 0).length ?? 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Importar catálogo documental</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Sube &quot;matrix tipos documentales&quot; (.xlsx). Se lee la hoja &quot;ESTRUCTURA_DETALLE&quot;.
        Las subsecciones 07-10 (Estudiantes/Docentes/Directivos/Familias) se separan
        automáticamente en 4 entradas por actor.
      </p>

      <input
        type="file"
        accept=".xlsx"
        aria-label="Archivo de catálogo documental"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="mt-4 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-primary-hover"
      />

      {parseError ? (
        <div role="alert" className="mt-4 rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
          {parseError}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md bg-surface-muted p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Entradas</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{result.entries.length}</p>
            </div>
            <div className="rounded-md bg-surface-muted p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">Subsecciones</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{sectionsSeen.length}</p>
            </div>
            <div className="rounded-md bg-surface-muted p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
                Pendientes de parametrización
              </p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  result.ambiguousRows.length > 0 ? "text-status-subsanar" : "text-status-cumple"
                }`}
              >
                {result.ambiguousRows.length}
              </p>
            </div>
            <div className="rounded-md bg-surface-muted p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
                Sin extensión detectada
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">{withoutExtension}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || result.entries.length === 0}
            className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {isPending ? "Importando…" : `Confirmar importación de ${result.entries.length} entradas`}
          </button>

          {confirmResult ? (
            <div
              role="status"
              className={`rounded-md border px-3 py-2 text-sm ${
                confirmResult.ok
                  ? "border-status-cumple/30 bg-status-cumple/10 text-status-cumple"
                  : "border-status-no-esta/30 bg-status-no-esta/10 text-status-no-esta"
              }`}
            >
              {confirmResult.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
