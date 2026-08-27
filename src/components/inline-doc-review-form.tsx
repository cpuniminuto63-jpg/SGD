"use client";

import Link from "next/link";
import { useRef } from "react";
import { submitReview } from "@/app/(app)/mi-bandeja/actions";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import type { ReviewStatus } from "@/lib/db/types";

/**
 * Marcar un documento individual (está / no está / etc. + comentario) directamente en
 * la fila de la tabla, sin navegar a una página aparte. Es independiente del veredicto
 * de apartado ("Marcar veredicto de este apartado" en la ficha de sede) — ese es el que
 * decide si toda la carpeta pasa a Cumple; esto es solo el estado de este documento.
 */
export function InlineDocReviewForm({
  expectedDocumentId,
  currentStatus,
  returnTo,
}: {
  expectedDocumentId: string;
  currentStatus: ReviewStatus;
  returnTo: string;
}) {
  const defaultStatus = REVIEW_STATUS_ORDER.includes(currentStatus) ? currentStatus : "cumple";

  // En Hostinger, a veces el redirect después de guardar se queda colgado (falla el
  // fetch interno de Next.js para traer la página de destino, aunque el guardado sí
  // se hizo). Si en unos segundos la navegación no se completó, recargamos solos en
  // vez de obligar a la persona a darle F5 manualmente.
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSubmit() {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => window.location.reload(), 4000);
  }

  return (
    <form action={submitReview} onSubmit={handleSubmit} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="expected_document_id" value={expectedDocumentId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <select
        name="status"
        defaultValue={defaultStatus}
        aria-label="Estado del documento"
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
      >
        {REVIEW_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {REVIEW_STATUS_META[s].label}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="observation"
        placeholder="Comentario"
        aria-label="Comentario"
        className="w-28 rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
      />
      <button
        type="submit"
        className="rounded-md bg-brand-primary px-2 py-1 text-xs font-semibold text-white hover:bg-brand-primary-hover"
      >
        Guardar
      </button>
      <Link
        href={`/mi-bandeja/${expectedDocumentId}?back=${encodeURIComponent(returnTo)}`}
        className="text-xs font-medium text-foreground-muted hover:text-brand-primary hover:underline"
      >
        Historial
      </Link>
    </form>
  );
}
