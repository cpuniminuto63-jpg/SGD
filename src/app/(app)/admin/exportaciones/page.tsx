import { requireRole } from "@/lib/auth/require-role";

interface ExportCard {
  href: string;
  title: string;
  description: string;
  badge: string;
}

const EXPORTS: ExportCard[] = [
  {
    href: "/api/export/estado-actual",
    title: "Matriz de estado actual",
    description:
      "Una fila por documento esperado, con el estado vigente, última observación y último revisor. Fuente: vw_estado_actual_documentos.",
    badge: ".xlsx",
  },
  {
    href: "/api/export/historial",
    title: "Historial de revisiones",
    description:
      "Una fila por cada acción de revisión registrada, con estado, hallazgo, prioridad y revisor. Fuente: vw_historial_revisiones.",
    badge: ".xlsx",
  },
  {
    href: "/api/export/calidad-sgd",
    title: "Calidad documental detalle",
    description:
      "Formato compatible con la app SGD legacy: columnas y nombres fijos (contrato de integración, sección 14). Úsalo para cargar resultados en SGD.",
    badge: ".csv · compatible SGD",
  },
];

export default async function ExportacionesPage() {
  await requireRole("administrador", "coordinador");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Exportación de resultados</h1>
        <p className="text-sm text-foreground-muted">
          Genera archivos actualizados a partir de los datos vigentes. Cada exportación queda
          registrada con quién la generó y cuándo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORTS.map((card) => (
          <div
            key={card.href}
            className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-sm"
          >
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{card.title}</h2>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">
                  {card.badge}
                </span>
              </div>
              <p className="text-sm text-foreground-muted">{card.description}</p>
            </div>
            <a
              href={card.href}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Descargar
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
