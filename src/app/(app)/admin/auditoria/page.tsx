import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";

const ACTION_LABEL: Record<string, string> = {
  toggle_active: "Activar/desactivar cuenta",
  reset_password: "Restablecer contraseña",
  editar_regla_catalogo: "Editar regla de catálogo",
  change_role: "Cambiar rol",
  delete_user: "Eliminar usuario",
};

export default async function AuditoriaPage() {
  await requireRole("administrador");

  let rows: {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    before: unknown;
    after: unknown;
    createdAt: Date;
    actorName: string | null;
  }[] = [];
  let error: string | null = null;

  try {
    rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        createdAt: auditLog.createdAt,
        actorName: profiles.fullName,
      })
      .from(auditLog)
      .leftJoin(profiles, eq(auditLog.actorId, profiles.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(500);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Auditoría de acciones</h1>
        <p className="text-sm text-foreground-muted">
          Registro de correcciones administrativas (últimas 500): quién, cuándo y qué cambió. No
          incluye el historial de revisiones documentales — ese vive en cada ficha de sede.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
          No se pudo cargar la auditoría: la base de datos no está conectada todavía ({error}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          Todavía no hay acciones registradas en la auditoría.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Quién</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Entidad</th>
                <th className="px-4 py-2 font-medium">Antes</th>
                <th className="px-4 py-2 font-medium">Después</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2 text-foreground-muted">
                    {new Date(row.createdAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-2 text-foreground">{row.actorName ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground">{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {row.entity}
                    {row.entityId ? <p className="text-xs">{row.entityId}</p> : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-foreground-muted">
                    {row.before ? JSON.stringify(row.before) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-foreground-muted">
                    {row.after ? JSON.stringify(row.after) : "—"}
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
