import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { importErrors, imports, profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";

const ERROR_TYPE_LABEL: Record<string, string> = {
  campo_obligatorio_faltante: "Campo obligatorio faltante",
  linea_no_reconocida: "Línea no reconocida",
  mentor_sin_identificacion: "Mentor sin identificación",
  dane_duplicado: "DANE duplicado",
  dane_faltante: "DANE faltante",
  regla_ambigua_pendiente_parametrizacion: "Regla ambigua — pendiente de parametrización",
};

const IMPORT_KIND_LABEL: Record<string, string> = {
  sedes: "Sedes",
  catalogo: "Catálogo documental",
  inventario_sgd: "Inventario SGD",
};

export default async function ErroresImportacionPage() {
  await requireRole("administrador");

  let rows: {
    id: string;
    rowNumber: number | null;
    errorType: string;
    details: unknown;
    createdAt: Date;
    importFileName: string;
    importKind: string;
    uploadedByName: string | null;
  }[] = [];
  let error: string | null = null;

  try {
    rows = await db
      .select({
        id: importErrors.id,
        rowNumber: importErrors.rowNumber,
        errorType: importErrors.errorType,
        details: importErrors.details,
        createdAt: importErrors.createdAt,
        importFileName: imports.fileName,
        importKind: imports.kind,
        uploadedByName: profiles.fullName,
      })
      .from(importErrors)
      .innerJoin(imports, eq(importErrors.importId, imports.id))
      .leftJoin(profiles, eq(imports.uploadedBy, profiles.id))
      .orderBy(desc(importErrors.createdAt))
      .limit(500);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Control de errores de importación</h1>
        <p className="text-sm text-foreground-muted">
          Filas rechazadas o marcadas con observaciones en cada importación (últimas 500). Las
          reglas ambiguas del catálogo se corrigen desde{" "}
          <span className="font-medium text-foreground">Administración → Catálogo documental</span>.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
          No se pudo cargar el listado: la base de datos no está conectada todavía ({error}).
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
          No hay errores de importación registrados. Buena señal.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Importación</th>
                <th className="px-4 py-2 font-medium">Fila</th>
                <th className="px-4 py-2 font-medium">Tipo de error</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
                <th className="px-4 py-2 font-medium">Subido por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2 text-foreground-muted">
                    {new Date(row.createdAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-2 text-foreground">
                    {IMPORT_KIND_LABEL[row.importKind] ?? row.importKind}
                    <p className="text-xs text-foreground-muted">{row.importFileName}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.rowNumber ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground">
                    {ERROR_TYPE_LABEL[row.errorType] ?? row.errorType}
                  </td>
                  <td className="px-4 py-2 text-xs text-foreground-muted">
                    {Object.keys(row.details ?? {}).length > 0 ? JSON.stringify(row.details) : "—"}
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">{row.uploadedByName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
