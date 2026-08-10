"use client";

import { useState, useTransition } from "react";
import { readWorkbookRows } from "@/lib/import/read-workbook";
import { parseInstitutions, type ParseInstitutionsResult } from "@/lib/import/parse-institutions";
import { reconcileTotalSessions } from "@/lib/import/session-rules";
import type { LineaCPE } from "@/lib/supabase/database.types";
import { importInstitutions, type ImportActionResult } from "@/app/(app)/admin/importaciones/actions";

const ERROR_TYPE_LABEL: Record<string, string> = {
  campo_obligatorio_faltante: "Campo obligatorio faltante",
  linea_no_reconocida: "Línea no reconocida",
  mentor_sin_identificacion: "Mentor sin identificación",
  dane_duplicado: "DANE duplicado",
  dane_faltante: "DANE faltante",
};

export function InstitutionsImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseInstitutionsResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setParseError(null);
    setConfirmResult(null);
    setFileName(file.name);
    try {
      const rows = await readWorkbookRows(file, "BASE_UNIFICADA");
      const dataRows = rows.slice(2);
      setResult(parseInstitutions(dataRows));
    } catch (err) {
      setResult(null);
      setParseError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  function handleConfirm() {
    if (!result || !fileName) return;
    startTransition(async () => {
      const res = await importInstitutions({ fileName, valid: result.valid, errors: result.errors });
      setConfirmResult(res);
    });
  }

  const countByLinea = { L1: 0, L2: 0, L3: 0 } as Record<LineaCPE, number>;
  result?.valid.forEach((r) => (countByLinea[r.linea] += 1));
  const reconciliation = result ? reconcileTotalSessions(countByLinea) : null;

  const errorCounts = new Map<string, number>();
  result?.errors.forEach((e) => errorCounts.set(e.errorType, (errorCounts.get(e.errorType) ?? 0) + 1));

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Importar base de sedes</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Sube BASE_UNIFICADA_4_COORDINADORES (.xlsx). Se lee la hoja &quot;BASE_UNIFICADA&quot;.
      </p>

      <input
        type="file"
        accept=".xlsx"
        aria-label="Archivo de base de sedes"
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
            <Stat label="Registros válidos" value={result.valid.length} />
            <Stat label="Filas con observaciones" value={result.errors.length} />
            <Stat label="DANE duplicados" value={result.duplicateDaneCodes.length} />
            <Stat
              label="Reconciliación sesiones"
              value={reconciliation?.total ?? 0}
              tone={reconciliation?.matchesExpected ? "ok" : "warn"}
              hint={reconciliation ? `esperado ${6696}` : undefined}
            />
          </div>

          {errorCounts.size > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Detalle de observaciones
              </p>
              <ul className="mt-1 space-y-1 text-sm text-foreground">
                {[...errorCounts.entries()].map(([type, count]) => (
                  <li key={type} className="flex justify-between rounded-md bg-surface-muted px-3 py-1.5">
                    <span>{ERROR_TYPE_LABEL[type] ?? type}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || result.valid.length === 0}
            className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {isPending ? "Importando…" : `Confirmar importación de ${result.valid.length} sedes`}
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

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  const color =
    tone === "ok" ? "text-status-cumple" : tone === "warn" ? "text-status-subsanar" : "text-foreground";
  return (
    <div className="rounded-md bg-surface-muted p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value.toLocaleString("es-CO")}</p>
      {hint ? <p className="text-[11px] text-foreground-muted">{hint}</p> : null}
    </div>
  );
}
