import Link from "next/link";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { institutions, profiles, reviewerAssignments } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/types";
import { toggleAssignment } from "./actions";

const PAGE_SIZE = 25;

interface SearchParams {
  revisor?: string;
  q?: string;
  page?: string;
  error?: string;
}

export default async function AsignacionesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("administrador");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const q = params.q?.trim();
  const selectedRevisorId = params.revisor;

  let revisores: { id: string; fullName: string; email: string; role: UserRole }[] = [];
  let profilesError: string | null = null;
  try {
    revisores = await db
      .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email, role: profiles.role })
      .from(profiles)
      .where(inArray(profiles.role, ["revisor", "coordinador"]))
      .orderBy(asc(profiles.fullName));
  } catch (err) {
    profilesError = err instanceof Error ? err.message : "error desconocido";
  }

  let institutionsList: {
    id: string;
    sedeName: string;
    institutionName: string;
    municipality: string;
    daneCode: string;
  }[] = [];
  let count = 0;
  let institutionsError: string | null = null;
  try {
    const whereClause = q ? ilike(institutions.sedeName, `%${q}%`) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: institutions.id,
          sedeName: institutions.sedeName,
          institutionName: institutions.institutionName,
          municipality: institutions.municipality,
          daneCode: institutions.daneCode,
        })
        .from(institutions)
        .where(whereClause)
        .orderBy(asc(institutions.sedeName))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ count: sql<number>`count(*)::int` }).from(institutions).where(whereClause),
    ]);
    institutionsList = rows;
    count = countRows[0]?.count ?? 0;
  } catch (err) {
    institutionsError = err instanceof Error ? err.message : "error desconocido";
  }

  let assignedIds = new Set<string>();
  let assignmentsError: string | null = null;
  if (selectedRevisorId) {
    try {
      const assignments = await db
        .select({ institutionId: reviewerAssignments.institutionId })
        .from(reviewerAssignments)
        .where(and(eq(reviewerAssignments.profileId, selectedRevisorId), eq(reviewerAssignments.active, true)));
      assignedIds = new Set(assignments.map((a) => a.institutionId));
    } catch (err) {
      assignmentsError = err instanceof Error ? err.message : "error desconocido";
    }
  }

  function hrefWith(overrides: Partial<SearchParams>) {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides };
    if (merged.revisor) next.set("revisor", merged.revisor);
    if (merged.q) next.set("q", merged.q);
    if (merged.page) next.set("page", merged.page);
    const qs = next.toString();
    return `/admin/asignaciones${qs ? `?${qs}` : ""}`;
  }

  const selectedRevisor = revisores.find((r) => r.id === selectedRevisorId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Asignación de sedes a revisores</h1>
        <p className="text-sm text-foreground-muted">
          Selecciona un revisor o coordinador y marca las sedes que puede ver y revisar. Quitar una
          asignación no borra el historial de revisiones ya registradas.
        </p>
      </div>

      {params.error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
        >
          {params.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Revisores y coordinadores
          </div>
          {profilesError ? (
            <p className="p-4 text-sm text-status-no-esta">
              No se pudieron cargar los usuarios: {profilesError}.
            </p>
          ) : revisores.length === 0 ? (
            <p className="p-4 text-sm text-foreground-muted">
              Todavía no hay revisores ni coordinadores creados.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {revisores.map((r) => (
                <li key={r.id}>
                  <Link
                    href={hrefWith({ revisor: r.id, page: undefined, q: params.q })}
                    className={
                      "block px-4 py-2 text-sm hover:bg-surface-muted " +
                      (r.id === selectedRevisorId
                        ? "bg-brand-primary/10 font-medium text-brand-primary"
                        : "text-foreground")
                    }
                  >
                    <p>{r.fullName}</p>
                    <p className="text-xs text-foreground-muted">
                      {r.role === "coordinador" ? "Coordinador" : "Revisor"} · {r.email}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          {!selectedRevisorId ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
              Selecciona un revisor o coordinador de la lista para ver y editar sus sedes asignadas.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <p className="text-sm text-foreground-muted">
                  Editando asignaciones de{" "}
                  <span className="font-medium text-foreground">
                    {selectedRevisor?.fullName ?? "usuario seleccionado"}
                  </span>
                </p>
              </div>

              <form className="flex flex-wrap items-end gap-3" action="/admin/asignaciones">
                <input type="hidden" name="revisor" value={selectedRevisorId} />
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

              {assignmentsError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
                >
                  No se pudieron cargar las asignaciones actuales: {assignmentsError}.
                </div>
              ) : null}

              {institutionsError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
                >
                  No se pudieron cargar las sedes: la base de datos no está conectada todavía (
                  {institutionsError}).
                </div>
              ) : institutionsList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
                  No hay sedes que coincidan con la búsqueda. Si es la primera vez, importa la base de
                  sedes desde{" "}
                  <span className="font-medium text-foreground">
                    Administración → Importación de matrices
                  </span>
                  .
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-4 py-2 font-medium">Sede</th>
                        <th className="px-4 py-2 font-medium">Municipio</th>
                        <th className="px-4 py-2 font-medium">DANE</th>
                        <th className="px-4 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {institutionsList.map((inst) => {
                        const isAssigned = assignedIds.has(inst.id);
                        return (
                          <tr key={inst.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2">
                              <p className="font-medium text-foreground">{inst.sedeName}</p>
                              <p className="text-xs text-foreground-muted">{inst.institutionName}</p>
                            </td>
                            <td className="px-4 py-2 text-foreground-muted">{inst.municipality}</td>
                            <td className="px-4 py-2 text-foreground-muted">{inst.daneCode}</td>
                            <td className="px-4 py-2 text-right">
                              <form action={toggleAssignment}>
                                <input type="hidden" name="profile_id" value={selectedRevisorId} />
                                <input type="hidden" name="institution_id" value={inst.id} />
                                <input
                                  type="hidden"
                                  name="next_action"
                                  value={isAssigned ? "unassign" : "assign"}
                                />
                                <input
                                  type="hidden"
                                  name="return_to"
                                  value={hrefWith({})}
                                />
                                <button
                                  type="submit"
                                  className={
                                    isAssigned
                                      ? "rounded-md border border-status-no-esta/30 px-3 py-1 text-xs font-medium text-status-no-esta hover:bg-status-no-esta/10"
                                      : "rounded-md bg-brand-primary px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                                  }
                                >
                                  {isAssigned ? "Quitar" : "Asignar"}
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {count > PAGE_SIZE ? (
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
                      page * PAGE_SIZE >= count
                        ? "pointer-events-none opacity-40"
                        : "text-brand-primary hover:underline"
                    }
                  >
                    Siguiente →
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
