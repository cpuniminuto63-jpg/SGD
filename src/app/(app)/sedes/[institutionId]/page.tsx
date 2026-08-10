import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { institutions, documentSections } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";

const ACTOR_LABELS: Record<string, string> = {
  estudiantes: "Estudiantes",
  docentes: "Docentes",
  directivos: "Directivos",
  familias: "Familias",
};

export default async function SedeDetallePage({
  params,
}: {
  params: Promise<{ institutionId: string }>;
}) {
  const profile = await getCurrentProfile();
  const { institutionId } = await params;
  const canComment = ["administrador", "coordinador", "revisor"].includes(profile.role);

  const visibleIds = await visibleInstitutionIds(profile);
  if (visibleIds !== null && !visibleIds.includes(institutionId)) {
    notFound();
  }

  let institutionError: string | null = null;
  let sectionsError: string | null = null;
  let sede: typeof institutions.$inferSelect | undefined;
  let sectionRows: (typeof documentSections.$inferSelect)[] = [];

  try {
    [sede] = await db.select().from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  } catch (e) {
    institutionError = e instanceof Error ? e.message : "Error desconocido";
  }

  if (!institutionError && !sede) notFound();

  try {
    sectionRows = await db
      .select()
      .from(documentSections)
      .orderBy(asc(documentSections.displayOrder));
  } catch (e) {
    sectionsError = e instanceof Error ? e.message : "Error desconocido";
  }

  if (institutionError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta"
      >
        No se pudo cargar la sede: {institutionError}
      </div>
    );
  }

  if (!sede) notFound();

  return (
    <div className="space-y-6">
      <Link href="/sedes" className="text-sm font-medium text-brand-primary hover:underline">
        ← Volver al explorador de sedes
      </Link>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{sede.sedeName}</h1>
        <p className="text-sm text-foreground-muted">{sede.institutionName}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground-muted">DANE</dt>
            <dd className="text-foreground">{sede.daneCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Municipio</dt>
            <dd className="text-foreground">
              {sede.municipality}, {sede.department}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Línea CPE</dt>
            <dd className="text-foreground">{sede.linea}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Coordinador / Mentor</dt>
            <dd className="text-foreground">
              {sede.coordinatorName ?? "—"} / {sede.mentorName ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Apartados</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Comentarios generales por apartado para esta sede. Cada comentario conserva su
          historial de versiones y autoría.
        </p>

        {sectionsError ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta"
          >
            No se pudo cargar el catálogo de apartados: {sectionsError}
          </div>
        ) : sectionRows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
            Todavía no hay apartados cargados. Importa el catálogo documental desde{" "}
            <span className="font-medium text-foreground">Administración → Importación de matrices</span>.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {sectionRows.map((section) => (
              <li key={section.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {section.code} · {section.name}
                  </p>
                  {section.actor ? (
                    <p className="text-xs text-foreground-muted">
                      {ACTOR_LABELS[section.actor] ?? section.actor}
                    </p>
                  ) : null}
                </div>
                {canComment ? (
                  <Link
                    href={`/sedes/${sede.id}/comentarios/${section.id}`}
                    className="shrink-0 text-sm font-medium text-brand-primary hover:underline"
                  >
                    Ver comentarios →
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-foreground-muted">Sin acceso</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
