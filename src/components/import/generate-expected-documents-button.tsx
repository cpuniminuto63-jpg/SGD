"use client";

import { useState, useTransition } from "react";
import { generateAllExpectedDocuments } from "@/app/(app)/admin/importaciones/actions";
import type { ImportActionResult } from "@/app/(app)/admin/importaciones/actions";

export function GenerateExpectedDocumentsButton() {
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await generateAllExpectedDocuments());
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Generar documentos esperados</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Combina las sedes y el catálogo ya importados con las reglas de sesión (L1/L2/L3) para
        crear la lista de documentos que cada sede debería tener. Ejecuta esto una vez que hayas
        importado sedes y catálogo. Volver a ejecutarlo sin reimportar no duplica documentos.
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="mt-4 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {isPending ? "Generando…" : "Generar documentos esperados"}
      </button>

      {result ? (
        <div
          role="status"
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? "border-status-cumple/30 bg-status-cumple/10 text-status-cumple"
              : "border-status-no-esta/30 bg-status-no-esta/10 text-status-no-esta"
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
