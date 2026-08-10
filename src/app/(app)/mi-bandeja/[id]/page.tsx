import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { visibleInstitutionIds } from "@/lib/authz/visible-institutions";
import { StatusBadge } from "@/components/status-badge";
import { REVIEW_STATUS_ORDER, REVIEW_STATUS_META } from "@/lib/review-status";
import { submitReview } from "../actions";
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

  // "Guardar y siguiente": siguiente documento pendiente de revisión distinto al actual,
  // restringido a las mismas sedes visibles para este usuario.
  let nextPendingId: string | null = null;
  try {
    const visibilityClause =
      ids !== null ? sql`and institution_id = any(${ids}::uuid[])` : sql``;
    const nextPending = await db.execute(sql`
      select expected_document_id from vw_estado_actual_documentos
      where estado_actual = 'pendiente_revision'
        and expected_document_id != ${id}
        ${visibilityClause}
      order by sede asc
      limit 1
    `);
    const nextRows = nextPending as unknown as { expected_document_id: string }[];
    nextPendingId = nextRows[0]?.expected_document_id ?? null;
  } catch {
    nextPendingId = null;
  }

  const backHref = back || "/mi-bandeja";
  const nextHref = nextPendingId
    ? `/mi-bandeja/${nextPendingId}${back ? `?back=${encodeURIComponent(back)}` : ""}`
    : backHref;
  const returnTo = `/mi-bandeja/${id}${back ? `?back=${encodeURIComponent(back)}` : ""}`;

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

      <ReviewForm expectedDocumentId={id} nextHref={nextHref} backHref={backHref} returnTo={returnTo} />

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

function ReviewForm({
  expectedDocumentId,
  nextHref,
  backHref,
  returnTo,
}: {
  expectedDocumentId: string;
  nextHref: string;
  backHref: string;
  returnTo: string;
}) {
  return (
    <form action={submitReview} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Nueva revisión</h2>
      <input type="hidden" name="expected_document_id" value={expectedDocumentId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-foreground">
            Estado
          </label>
          <select
            id="status"
            name="status"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            {REVIEW_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium text-foreground">
            Prioridad
          </label>
          <select
            id="priority"
            name="priority"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="">Sin definir</option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="observation" className="mb-1 block text-sm font-medium text-foreground">
            Observación{" "}
            <span className="text-foreground-muted">
              (obligatoria para No está / Pendiente por subsanar / No aplica / Reemplazado)
            </span>
          </label>
          <textarea
            id="observation"
            name="observation"
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div>
          <label htmlFor="finding_type" className="mb-1 block text-sm font-medium text-foreground">
            Tipo de hallazgo
          </label>
          <select
            id="finding_type"
            name="finding_type"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="">Ninguno</option>
            <option value="documento_ausente">Documento ausente</option>
            <option value="nomenclatura_incorrecta">Nomenclatura incorrecta</option>
            <option value="extension_incorrecta">Extensión incorrecta</option>
            <option value="ubicacion_incorrecta">Ubicación incorrecta</option>
            <option value="duplicado">Duplicado</option>
            <option value="calidad_contenido">Calidad de contenido</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label htmlFor="remediation_due_date" className="mb-1 block text-sm font-medium text-foreground">
            Fecha límite de subsanación
          </label>
          <input
            id="remediation_due_date"
            name="remediation_due_date"
            type="date"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <input id="requires_remediation" name="requires_remediation" type="checkbox" className="h-4 w-4" />
          <label htmlFor="requires_remediation" className="text-sm text-foreground">
            Requiere subsanación
          </label>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="file_reference" className="mb-1 block text-sm font-medium text-foreground">
            Enlace o referencia del archivo
          </label>
          <input
            id="file_reference"
            name="file_reference"
            type="text"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="closing_comment" className="mb-1 block text-sm font-medium text-foreground">
            Comentario de cierre
          </label>
          <textarea
            id="closing_comment"
            name="closing_comment"
            rows={2}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          name="next"
          value={backHref}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          Guardar
        </button>
        <button
          type="submit"
          name="next"
          value={nextHref}
          className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
        >
          Guardar y siguiente
        </button>
      </div>
    </form>
  );
}
