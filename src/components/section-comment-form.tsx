"use client";

import { useRef } from "react";
import { submitSectionReview } from "@/app/(app)/sedes/actions";

/** Igual razón que InlineDocReviewForm: si el redirect de Next.js se queda colgado
 * (pasa a veces en Hostinger), recargamos solos en vez de que la persona tenga que
 * darle F5 a mano para ver que sí se guardó. */
export function SectionCommentForm({
  institutionId,
  sectionId,
  returnTo,
  status,
}: {
  institutionId: string;
  sectionId: string;
  returnTo: string;
  status: string;
}) {
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSubmit() {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => window.location.reload(), 4000);
  }

  return (
    <form
      action={submitSectionReview}
      onSubmit={handleSubmit}
      className="rounded-md border border-dashed border-border p-3"
    >
      <input type="hidden" name="institution_id" value={institutionId} />
      <input type="hidden" name="section_id" value={sectionId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="status" value={status} />
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        Agregar comentario general a esta carpeta
      </p>
      <p className="mb-2 text-xs text-foreground-muted">
        El estado ya no se marca a mano — se calcula solo a partir de los documentos
        obligatorios. Esto es solo para dejar contexto adicional.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label htmlFor={`comment-${sectionId}`} className="mb-1 block text-xs font-medium text-foreground-muted">
            Comentario
          </label>
          <input
            id={`comment-${sectionId}`}
            name="comment"
            type="text"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-primary-hover"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
