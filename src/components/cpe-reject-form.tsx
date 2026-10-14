import { markCpeRechazado } from "@/app/(app)/sedes/[institutionId]/actions";

/** Igual que SgdRejectForm: <details> nativo para no depender de la hidratación. */
export function CpeRejectForm({ institutionId }: { institutionId: string }) {
  return (
    <details className="w-full">
      <summary className="inline-block cursor-pointer list-none rounded-md border border-status-no-esta/40 px-3 py-1.5 text-xs font-medium text-status-no-esta hover:bg-status-no-esta/10">
        Rechazar (CPE)
      </summary>
      <form
        action={markCpeRechazado}
        className="mt-2 w-full rounded-md border border-status-no-esta/30 bg-status-no-esta/5 p-3"
      >
        <input type="hidden" name="institution_id" value={institutionId} />
        <label htmlFor="cpe-reject-comment" className="mb-1 block text-xs font-medium text-foreground-muted">
          ¿Por qué CPE rechaza esta sede? (obligatorio)
        </label>
        <textarea
          id="cpe-reject-comment"
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
            Confirmar rechazo de CPE
          </button>
        </div>
      </form>
    </details>
  );
}
