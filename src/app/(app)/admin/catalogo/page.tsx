import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentCatalog, documentSections } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { updateCatalogEntry } from "./actions";

export default async function CatalogoDocumentalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireRole("administrador");
  const { error, success } = await searchParams;

  let rows: {
    id: string;
    evidenceName: string;
    description: string | null;
    required: boolean;
    allowedExtensions: string[];
    allowedNamingPatterns: string[];
    sectionName: string;
    sectionCode: string;
  }[] = [];
  let loadError: string | null = null;

  try {
    const result = await db
      .select({
        id: documentCatalog.id,
        evidenceName: documentCatalog.evidenceName,
        description: documentCatalog.description,
        required: documentCatalog.required,
        allowedExtensions: documentCatalog.allowedExtensions,
        allowedNamingPatterns: documentCatalog.allowedNamingPatterns,
        sectionName: documentSections.name,
        sectionCode: documentSections.code,
      })
      .from(documentCatalog)
      .innerJoin(documentSections, eq(documentCatalog.sectionId, documentSections.id))
      .orderBy(asc(documentSections.displayOrder), asc(documentCatalog.evidenceName));
    rows = result;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Error desconocido";
  }

  const bySection = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySection.get(row.sectionName) ?? [];
    list.push(row);
    bySection.set(row.sectionName, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Administración del catálogo documental</h1>
        <p className="text-sm text-foreground-muted">
          Corrige obligatoriedad, extensiones permitidas y nomenclaturas válidas sin tocar código.
          Cada cambio queda registrado en la auditoría.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-md border border-status-cumple/30 bg-status-cumple/10 px-3 py-2 text-sm text-status-cumple">
          {success}
        </div>
      ) : null}

      {loadError ? (
        <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
          No se pudo cargar el catálogo: la base de datos no está conectada todavía ({loadError}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay catálogo documental importado. Ve a{" "}
          <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
        </div>
      ) : (
        <div className="space-y-4">
          {[...bySection.entries()].map(([sectionName, entries]) => (
            <div key={sectionName} className="rounded-lg border border-border bg-surface shadow-sm">
              <div className="border-b border-border bg-surface-muted px-4 py-2">
                <p className="text-sm font-semibold text-foreground">{sectionName}</p>
              </div>
              <ul className="divide-y divide-border">
                {entries.map((entry) => (
                  <li key={entry.id} className="p-4">
                    <form action={updateCatalogEntry} className="space-y-2">
                      <input type="hidden" name="id" value={entry.id} />
                      <p className="text-sm font-medium text-foreground">{entry.evidenceName}</p>
                      {entry.description ? (
                        <p className="text-xs text-foreground-muted">{entry.description}</p>
                      ) : null}
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label
                            htmlFor={`required-${entry.id}`}
                            className="mb-1 block text-xs font-medium text-foreground-muted"
                          >
                            Obligatorio
                          </label>
                          <select
                            id={`required-${entry.id}`}
                            name="required"
                            defaultValue={entry.required ? "true" : "false"}
                            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                          >
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                        <div className="min-w-[180px]">
                          <label
                            htmlFor={`ext-${entry.id}`}
                            className="mb-1 block text-xs font-medium text-foreground-muted"
                          >
                            Extensiones permitidas (separadas por coma)
                          </label>
                          <input
                            id={`ext-${entry.id}`}
                            name="allowed_extensions"
                            type="text"
                            defaultValue={entry.allowedExtensions.join(", ")}
                            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                          />
                        </div>
                        <div className="min-w-[220px] flex-1">
                          <label
                            htmlFor={`nom-${entry.id}`}
                            className="mb-1 block text-xs font-medium text-foreground-muted"
                          >
                            Nomenclaturas válidas (una por línea)
                          </label>
                          <textarea
                            id={`nom-${entry.id}`}
                            name="allowed_naming_patterns"
                            rows={2}
                            defaultValue={entry.allowedNamingPatterns.join("\n")}
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
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
