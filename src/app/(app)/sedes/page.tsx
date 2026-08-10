import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import type { Database } from "@/lib/supabase/database.types";

type Institution = Database["public"]["Tables"]["institutions"]["Row"];

interface SearchParams {
  q?: string;
}

export default async function SedesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await getCurrentProfile();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("institutions").select("*").order("sede_name", { ascending: true });
  if (q?.trim()) {
    query = query.ilike("sede_name", `%${q.trim()}%`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as Institution[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Explorador de sedes</h1>
        <p className="text-sm text-foreground-muted">
          Consulta las 306 sedes y accede a los comentarios generales por apartado de cada una.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/sedes">
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-foreground-muted">
            Buscar sede
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nombre de la sede…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
        >
          Buscar
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          No se pudo cargar el listado de sedes: la base de datos no está conectada todavía (
          {error.message}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          No hay sedes que coincidan con este filtro. Si es la primera vez, importa la base de
          sedes desde{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 font-medium">DANE</th>
                <th className="px-4 py-2 font-medium">Municipio</th>
                <th className="px-4 py-2 font-medium">Línea</th>
                <th className="px-4 py-2 font-medium">Coordinador</th>
                <th className="px-4 py-2 font-medium">Mentor</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-foreground">{row.sede_name}</p>
                    <p className="text-xs text-foreground-muted">{row.institution_name}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.dane_code}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {row.municipality}, {row.department}
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.linea}</td>
                  <td className="px-4 py-2 text-foreground-muted">{row.coordinator_name ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{row.mentor_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/sedes/${row.id}`}
                      className="font-medium text-brand-primary hover:underline"
                    >
                      Ver sede
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
