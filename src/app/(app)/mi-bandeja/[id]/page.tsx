import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import { REVIEW_STATUS_META } from "@/lib/review-status";
import type { EstadoActualRow } from "@/lib/types/estado-actual-row";
import type { HistorialRevisionRow } from "@/lib/types/historial-row";

export default async function RevisarDocumentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; error?: string }>;
}) {
  const { id } = await params;
  const { back, error: submitError } = await searchParams;
  const profile = await getCurrentProfile();
  const ids = await visibleInstitutionIds(profile);

  let row: EstadoActualRow | null = null;
  let docError: string | null = null;

  try {
    const result = await db.execute(sql`
      select * from vw_estado_actual_documentos
      where expected_document_id = ${id}
    `);
    const rows = result as unknown as EstadoActualRow[];
    row = rows[0] ?? null;
  } catch (err) {
    docError = err instanceof Error ? err.message : "Error desconocido";
  }

  if (docError) {
    return (
      <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
        No se pudo cargar el documento: {docError}
      </div>
    );
  }
  if (!row) notFound();

  // Un revisor/coordinador no puede ver documentos de sedes fuera de su alcance,
  // ni siquiera adivinando la URL — ya no hay RLS de respaldo.
  if (ids !== null && !ids.includes(row.institution_id)) notFound();

  let historialRows: HistorialRevisionRow[] = [];
  try {
    const historial = await db.execute(sql`
      select * from vw_historial_revisiones
      where expected_document_id = ${id}
      order by fecha_revision desc
    `);
    historialRows = historial as unknown as HistorialRevisionRow[];
  } catch {
    historialRows = [];
  }

  const backHref = back || "/mi-bandeja";

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm font-medium text-brand-primary hover:underline">
        ← Volver a la bandeja
      </Link>

      {submitError ? (
        <div role="alert" className="rounded-md border border-status-no-esta/30 bg-status-no-esta/10 px-3 py-2 text-sm text-status-no-esta">
          {submitError}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{row.evidencia}</h1>
            <p className="text-sm text-foreground-muted">
              {row.sede} ({row.dane_sede}) · {row.apartado}
              {row.actor ? ` · ${row.actor}` : ""}
              {row.sesion ? ` · sesión ${row.sesion}` : ""}
            </p>
            <p className="text-xs text-foreground-muted">
              {row.municipio}, {row.departamento} · Coordinador: {row.coordinador ?? "—"} · Mentor:{" "}
              {row.mentor ?? "—"}
            </p>
          </div>
          <StatusBadge status={row.estado_actual} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground-muted">Obligatorio</dt>
            <dd className="text-foreground">{row.obligatorio ? "Sí" : "No"}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted"># Revisiones</dt>
            <dd className="text-foreground">{row.numero_revisiones}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Última revisión</dt>
            <dd className="text-foreground">{row.fecha_ultima_revision?.slice(0, 10) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Último revisor</dt>
            <dd className="text-foreground">{row.ultimo_revisor ?? "—"}</dd>
          </div>
        </dl>
        {row.ruta_archivo ? (
          <a
            href={row.ruta_archivo}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-medium text-brand-primary hover:underline"
          >
            Abrir archivo →
          </a>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Historial</h2>
        {historialRows.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">Todavía no hay revisiones registradas.</p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-border pl-4">
            {historialRows.map((h) => (
              <li key={h.review_event_id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                <p className="text-xs text-foreground-muted">
                  {new Date(h.fecha_revision).toLocaleString("es-CO")} · {h.revisor}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {REVIEW_STATUS_META[h.estado as keyof typeof REVIEW_STATUS_META]?.label ?? h.estado}
                </p>
                {h.observacion ? <p className="text-sm text-foreground-muted">{h.observacion}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

