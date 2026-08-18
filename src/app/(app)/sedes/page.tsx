import Link from "next/link";
import { and, asc, desc, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, expectedDocuments, sectionReviews } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";

/** "Trasladado a revisión SGD": todos los apartados con documentos esperados de la
 * sede tienen un veredicto manual vigente de 'cumple' (ver sedes/[institutionId]). */
async function getTrasladadoRevisionSgdMap(institutionIds: string[]): Promise<Map<string, boolean>> {
  if (institutionIds.length === 0) return new Map();

  const [apartadosEsperados, allReviews] = await Promise.all([
    db
      .selectDistinct({ institutionId: expectedDocuments.institutionId, sectionId: expectedDocuments.sectionId })
      .from(expectedDocuments)
      .where(inArray(expectedDocuments.institutionId, institutionIds)),
    db
      .select({
        institutionId: sectionReviews.institutionId,
        sectionId: sectionReviews.sectionId,
        status: sectionReviews.status,
      })
      .from(sectionReviews)
      .where(inArray(sectionReviews.institutionId, institutionIds))
      .orderBy(desc(sectionReviews.createdAt)),
  ]);

  const latestBySedeSection = new Map<string, string>();
  for (const r of allReviews) {
    const key = `${r.institutionId}|${r.sectionId}`;
    if (!latestBySedeSection.has(key)) latestBySedeSection.set(key, r.status);
  }

  const sectionsByInstitution = new Map<string, Set<string>>();
  for (const row of apartadosEsperados) {
    const set = sectionsByInstitution.get(row.institutionId) ?? new Set<string>();
    set.add(row.sectionId);
    sectionsByInstitution.set(row.institutionId, set);
  }

  const result = new Map<string, boolean>();
  for (const [institutionId, sectionIds] of sectionsByInstitution) {
    const allCumple =
      sectionIds.size > 0 &&
      [...sectionIds].every((sid) => latestBySedeSection.get(`${institutionId}|${sid}`) === "cumple");
    result.set(institutionId, allCumple);
  }
  return result;
}

interface SearchParams {
  q?: string;
}

export default async function SedesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  const { q } = await searchParams;

  let rows: (typeof institutions.$inferSelect)[] = [];
  let trasladadoMap = new Map<string, boolean>();
  let error: string | null = null;

  try {
    const ids = await visibleInstitutionIds(profile);
    const search = q?.trim();

    const conditions = [
      ids !== null ? inArray(institutions.id, ids) : undefined,
      search ? ilike(institutions.sedeName, `%${search}%`) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    rows = await db
      .select()
      .from(institutions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(institutions.sedeName));

    trasladadoMap = await getTrasladadoRevisionSgdMap(rows.map((r) => r.id));
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

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
          {error}).
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
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-foreground">{row.sedeName}</p>
                    <p className="text-xs text-foreground-muted">{row.institutionName}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.daneCode}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {row.municipality}, {row.department}
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.linea}</td>
                  <td className="px-4 py-2 text-foreground-muted">{row.coordinatorName ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground-muted">{row.mentorName ?? "—"}</td>
                  <td className="px-4 py-2">
                    {trasladadoMap.get(row.id) ? (
                      <span className="rounded-full bg-brand-secondary/15 px-2.5 py-1 text-xs font-semibold text-brand-secondary">
                        Trasladado a revisión SGD
                      </span>
                    ) : (
                      <span className="text-xs text-foreground-muted">En revisión</span>
                    )}
                  </td>
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
