import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { StatusBadge } from "@/components/status-badge";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";
import type { ReviewStatus } from "@/lib/supabase/database.types";

const PAGE_SIZE = 30;

interface SearchParams {
  estado?: string;
  q?: string;
  page?: string;
}

export default async function MiBandejaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const estado = params.estado as ReviewStatus | undefined;
  const q = params.q?.trim();

  const supabase = await createClient();
  let query = supabase
    .from("vw_estado_actual_documentos")
    .select("*", { count: "exact" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (estado) query = query.eq("estado_actual", estado);
  if (q) query = query.ilike("sede", `%${q}%`);

  const { data, count, error } = await query;
  const rows = (data ?? []) as unknown as EstadoActualRow[];

  function hrefWith(overrides: Partial<SearchParams>) {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides };
    if (merged.estado) next.set("estado", merged.estado);
    if (merged.q) next.set("q", merged.q);
    if (merged.page) next.set("page", merged.page);
    const qs = next.toString();
    return `/mi-bandeja${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Mi bandeja de revisión</h1>
        <p className="text-sm text-foreground-muted">
          {profile.role === "revisor"
            ? "Documentos de las sedes que tienes asignadas."
            : "Todos los documentos visibles según tu rol."}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/mi-bandeja">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-foreground-muted">
            Sede
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Buscar sede…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label htmlFor="estado" className="mb-1 block text-xs font-medium text-foreground-muted">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estado ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">Todos</option>
            {REVIEW_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
        >
          Filtrar
        </button>
      </form>

      {error ? (
        <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
          No se pudo cargar la bandeja: la base de datos no está conectada todavía ({error.message}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          No hay documentos que coincidan con este filtro. Si es la primera vez, importa sedes y
          catálogo, y genera los documentos esperados desde{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 font-medium">Apartado</th>
                <th className="px-4 py-2 font-medium">Actor / Sesión</th>
                <th className="px-4 py-2 font-medium">Evidencia</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium"># Revisiones</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.expected_document_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-foreground">{row.sede}</p>
                    <p className="text-xs text-foreground-muted">{row.dane_sede}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground">{row.apartado}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {row.actor ? `${row.actor}${row.sesion ? ` · ${row.sesion}` : ""}` : "General"}
                  </td>
                  <td className="px-4 py-2 text-foreground">{row.evidencia}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.estado_actual} />
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.numero_revisiones}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/mi-bandeja/${row.expected_document_id}?back=${encodeURIComponent(hrefWith({}))}`}
                      className="font-medium text-brand-primary hover:underline"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {count && count > PAGE_SIZE ? (
        <div className="flex justify-between text-sm text-foreground-muted">
          <Link
            href={hrefWith({ page: String(page - 1) })}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"}
          >
            ← Anterior
          </Link>
          <span>
            Página {page} de {Math.ceil(count / PAGE_SIZE)}
          </span>
          <Link
            href={hrefWith({ page: String(page + 1) })}
            aria-disabled={page * PAGE_SIZE >= count}
            className={
              page * PAGE_SIZE >= count ? "pointer-events-none opacity-40" : "text-brand-primary hover:underline"
            }
          >
            Siguiente →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
