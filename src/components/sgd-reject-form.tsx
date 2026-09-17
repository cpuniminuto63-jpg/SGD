"use client";

import { useState } from "react";
import { markSgdRechazado } from "@/app/(app)/sedes/[institutionId]/actions";

/** Botón "Rechazar" para el rol SGD — al hacer clic despliega un textarea para el
 * comentario obligatorio de por qué se rechaza, en vez de mandar el formulario de
 * una vez (así no se puede rechazar sin explicar el motivo). */
export function SgdRejectForm({ institutionId }: { institutionId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-status-no-esta/40 px-3 py-1.5 text-xs font-medium text-status-no-esta hover:bg-status-no-esta/10"
      >
        Rechazar
      </button>
    );
  }

  return (
    <form action={markSgdRechazado} className="w-full rounded-md border border-status-no-esta/30 bg-status-no-esta/5 p-3">
      <input type="hidden" name="institution_id" value={institutionId} />
      <label htmlFor="sgd-reject-comment" className="mb-1 block text-xs font-medium text-foreground-muted">
        ¿Por qué se rechaza esta sede? (obligatorio)
      </label>
      <textarea
        id="sgd-reject-comment"
        name="comment"
        required
        rows={3}
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-status-no-esta px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Confirmar rechazo
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
