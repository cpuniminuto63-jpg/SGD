import { markSgdRechazado } from "@/app/(app)/sedes/[institutionId]/actions";

/** Botón "Rechazar" para el rol SGD — usa <details>/<summary> nativo del navegador
 * para desplegar el textarea del comentario obligatorio, en vez de useState. Así no
 * depende de que React haya hidratado este componente en el cliente: el despliegue
 * funciona con puro HTML, igual que el envío del formulario (Server Action). Antes
 * usaba un botón con onClick — si por lo que sea la hidratación de esa isla fallaba,
 * el botón se quedaba sin reaccionar y parecía que "Rechazar no hacía nada" aunque
 * "Aprobar" (un <form> normal) sí funcionaba (bug real reportado 2026-09-17). */
export function SgdRejectForm({ institutionId }: { institutionId: string }) {
  return (
    <details className="w-full">
      <summary className="inline-block cursor-pointer list-none rounded-md border border-status-no-esta/40 px-3 py-1.5 text-xs font-medium text-status-no-esta hover:bg-status-no-esta/10">
        Rechazar
      </summary>
      <form
        action={markSgdRechazado}
        className="mt-2 w-full rounded-md border border-status-no-esta/30 bg-status-no-esta/5 p-3"
      >
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
        </div>
      </form>
    </details>
  );
}
