import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { submitSectionComment } from "../../../actions";

type Institution = Database["public"]["Tables"]["institutions"]["Row"];
type DocumentSection = Database["public"]["Tables"]["document_sections"]["Row"];
type SectionComment = Database["public"]["Tables"]["section_comments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default async function ComentariosApartadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ institutionId: string; sectionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("administrador", "coordinador", "revisor");
  const { institutionId, sectionId } = await params;
  const { error: formError } = await searchParams;
  const supabase = await createClient();

  const [{ data: institution, error: institutionError }, { data: section, error: sectionError }] =
    await Promise.all([
      supabase.from("institutions").select("*").eq("id", institutionId).maybeSingle(),
      supabase.from("document_sections").select("*").eq("id", sectionId).maybeSingle(),
    ]);

  if (institutionError || sectionError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
      >
        No se pudo cargar la información: {(institutionError ?? sectionError)?.message}
      </div>
    );
  }
  if (!institution || !section) notFound();

  const sede = institution as Institution;
  const apartado = section as DocumentSection;

  const { data: comments, error: commentsError } = await supabase
    .from("section_comments")
    .select("*")
    .eq("institution_id", institutionId)
    .eq("section_id", sectionId)
    .order("version", { ascending: false });

  const commentRows = (comments ?? []) as SectionComment[];

  const authorIds = Array.from(new Set(commentRows.map((c) => c.author_id)));
  let authorsById = new Map<string, Profile>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("profiles")
      .select("*")
      .in("id", authorIds);
    authorsById = new Map(((authors ?? []) as Profile[]).map((a) => [a.id, a]));
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
        <h1 className="text-lg font-semibold text-foreground">{sede.sede_name}</h1>
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
            No se pudo cargar el historial: {commentsError.message}
          </div>
        ) : commentRows.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">
            Todavía no hay comentarios registrados para este apartado en esta sede.
          </p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-border pl-4">
            {commentRows.map((c) => {
              const author = authorsById.get(c.author_id);
              return (
                <li key={c.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                  <p className="text-xs text-foreground-muted">
                    v{c.version} · {new Date(c.created_at).toLocaleString("es-CO")} ·{" "}
                    {author?.full_name ?? "Usuario desconocido"}
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
