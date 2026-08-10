import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, documentSections, sectionComments, profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { submitSectionComment } from "../../../actions";

export default async function ComentariosApartadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ institutionId: string; sectionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireRole("administrador", "coordinador", "revisor");
  const { institutionId, sectionId } = await params;
  const { error: formError } = await searchParams;

  const visibleIds = await visibleInstitutionIds(profile);
  if (visibleIds !== null && !visibleIds.includes(institutionId)) {
    notFound();
  }

  let institutionError: string | null = null;
  let sectionError: string | null = null;
  let sede: typeof institutions.$inferSelect | undefined;
  let apartado: typeof documentSections.$inferSelect | undefined;

  try {
    const [[institutionRow], [sectionRow]] = await Promise.all([
      db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1),
      db.select().from(documentSections).where(eq(documentSections.id, sectionId)).limit(1),
    ]);
    sede = institutionRow;
    apartado = sectionRow;
  } catch (e) {
    institutionError = e instanceof Error ? e.message : "Error desconocido";
    sectionError = institutionError;
  }

  if (institutionError || sectionError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
      >
        No se pudo cargar la información: {institutionError ?? sectionError}
      </div>
    );
  }
  if (!sede || !apartado) notFound();

  let commentsError: string | null = null;
  let commentRows: (typeof sectionComments.$inferSelect)[] = [];
  let authorsById = new Map<string, typeof profiles.$inferSelect>();

  try {
    commentRows = await db
      .select()
      .from(sectionComments)
      .where(and(eq(sectionComments.institutionId, institutionId), eq(sectionComments.sectionId, sectionId)))
      .orderBy(desc(sectionComments.version));

    const authorIds = Array.from(new Set(commentRows.map((c) => c.authorId)));
    if (authorIds.length > 0) {
      const authors = await db.select().from(profiles).where(inArray(profiles.id, authorIds));
      authorsById = new Map(authors.map((a) => [a.id, a]));
    }
  } catch (e) {
    commentsError = e instanceof Error ? e.message : "Error desconocido";
  }

  const backHref = `/sedes/${institutionId}`;
  const returnTo = `/sedes/${institutionId}/comentarios/${sectionId}`;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm font-medium text-brand-primary hover:underline">
        ← Volver a la sede
      </Link>

      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta"
        >
          {formError}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{sede.sedeName}</h1>
        <p className="text-sm text-foreground-muted">
          {apartado.code} · {apartado.name}
          {apartado.actor ? ` · ${apartado.actor}` : ""}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Historial de comentarios</h2>
        {commentsError ? (
          <div
            role="alert"
            className="mt-3 rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta"
          >
            No se pudo cargar el historial: {commentsError}
          </div>
        ) : commentRows.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">
            Todavía no hay comentarios registrados para este apartado en esta sede.
          </p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-border pl-4">
            {commentRows.map((c) => {
              const author = authorsById.get(c.authorId);
              return (
                <li key={c.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                  <p className="text-xs text-foreground-muted">
                    v{c.version} · {new Date(c.createdAt).toLocaleString("es-CO")} ·{" "}
                    {author?.fullName ?? "Usuario desconocido"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{c.comment}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form
        action={submitSectionComment}
        className="rounded-lg border border-border bg-surface p-5 shadow-sm"
      >
        <h2 className="text-base font-semibold text-foreground">Nuevo comentario</h2>
        <input type="hidden" name="institution_id" value={institutionId} />
        <input type="hidden" name="section_id" value={sectionId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <div className="mt-4">
          <label htmlFor="comment" className="mb-1 block text-sm font-medium text-foreground">
            Comentario
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={4}
            required
            placeholder="Describe la observación general para este apartado…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <p className="mt-1 text-xs text-foreground-muted">
            Los comentarios no se pueden editar ni eliminar: cada envío crea una nueva versión y
            conserva la autoría.
          </p>
        </div>

        <div className="mt-4">
          <button
            type="submit"
            className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
          >
            Guardar comentario
          </button>
        </div>
      </form>
    </div>
  );
}
