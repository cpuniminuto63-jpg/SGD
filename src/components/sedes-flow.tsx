import Link from "next/link";
import { SEDE_OVERALL_STATUS_META, type SedeOverallStatus } from "@/lib/sede-status";

/** Un solo paso del flujo: numero grande, etiqueta, enlace al explorador filtrado, y
 * opcionalmente una insignia con una sub-cantidad (las solicitudes de re-revision y de
 * segunda revision de SGD no son un paso propio del flujo -- son una cantidad *dentro*
 * de su categoria madre, por eso van como badge y no como caja aparte). */
interface FlowStep {
  key: string;
  label: string;
  value: number;
  href: string;
  colorVar: string;
  badge?: { label: string; value: number; href: string };
}

function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center text-foreground-muted/50">
      <span className="sm:hidden">↓</span>
      <span className="hidden sm:inline">→</span>
    </div>
  );
}

function StepBox({ step }: { step: FlowStep }) {
  return (
    <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
      <Link
        href={step.href}
        className="flex w-full min-w-[130px] flex-col items-center rounded-lg border border-border bg-surface p-4 text-center shadow-sm transition-colors hover:bg-surface-muted sm:w-[150px]"
      >
        <p className="text-2xl font-semibold" style={{ color: `var(${step.colorVar})` }}>
          {step.value}
        </p>
        <p className="mt-1 text-xs font-medium text-foreground-muted">{step.label}</p>
      </Link>
      {step.badge && step.badge.value > 0 ? (
        <Link
          href={step.badge.href}
          className="rounded-full border border-status-subsanar/40 bg-status-subsanar/10 px-2.5 py-1 text-[11px] font-medium text-status-subsanar hover:bg-status-subsanar/20"
        >
          {step.badge.label}: {step.badge.value}
        </Link>
      ) : null}
    </div>
  );
}

export function SedesFlow({
  total,
  sedeOverallCounts,
  sgdAprobado,
  sgdRechazadoTotal,
  sgdEnSegundaRevision,
  trasladoEafit,
  entregadoCpe,
  reRevisionPendiente,
}: {
  total: number;
  sedeOverallCounts: Record<SedeOverallStatus, number>;
  sgdAprobado: number;
  sgdRechazadoTotal: number;
  sgdEnSegundaRevision: number;
  trasladoEafit: number;
  entregadoCpe: number;
  reRevisionPendiente: number;
}) {
  const steps: FlowStep[] = [
    {
      key: "sin_revisar",
      label: SEDE_OVERALL_STATUS_META.sin_revisar.label,
      value: sedeOverallCounts.sin_revisar,
      href: "/sedes?estado=sin_revisar",
      colorVar: SEDE_OVERALL_STATUS_META.sin_revisar.colorVar,
    },
    {
      key: "pendiente_subsanar",
      label: SEDE_OVERALL_STATUS_META.pendiente_subsanar.label,
      value: sedeOverallCounts.pendiente_subsanar,
      href: "/sedes?estado=pendiente_subsanar",
      colorVar: SEDE_OVERALL_STATUS_META.pendiente_subsanar.colorVar,
      badge: { label: "Re-revisión pedida", value: reRevisionPendiente, href: "/sedes?pipeline=rerevision" },
    },
    {
      key: "no_esta",
      label: SEDE_OVERALL_STATUS_META.no_esta.label,
      value: sedeOverallCounts.no_esta,
      href: "/sedes?estado=no_esta",
      colorVar: SEDE_OVERALL_STATUS_META.no_esta.colorVar,
    },
    {
      key: "volver_a_campo",
      label: SEDE_OVERALL_STATUS_META.volver_a_campo.label,
      value: sedeOverallCounts.volver_a_campo,
      href: "/sedes?estado=volver_a_campo",
      colorVar: SEDE_OVERALL_STATUS_META.volver_a_campo.colorVar,
    },
    {
      key: "trasladado_sgd",
      label: SEDE_OVERALL_STATUS_META.trasladado_sgd.label,
      value: sedeOverallCounts.trasladado_sgd,
      href: "/sedes?estado=trasladado_sgd",
      colorVar: SEDE_OVERALL_STATUS_META.trasladado_sgd.colorVar,
    },
    {
      key: "rechazada",
      label: "Rechazada por SGD",
      value: sgdRechazadoTotal,
      href: "/sedes?pipeline=sgd_rechazado_total",
      colorVar: "--color-status-no-esta",
      badge: { label: "Segunda revisión pedida", value: sgdEnSegundaRevision, href: "/sedes?pipeline=sgd_segunda_revision" },
    },
    {
      key: "aprobada",
      label: "Aprobada por SGD",
      value: sgdAprobado,
      href: "/sedes?pipeline=sgd_aprobado",
      colorVar: "--color-status-cumple",
    },
    {
      key: "eafit",
      label: "Traslado EAFIT",
      value: trasladoEafit,
      href: "/sedes?pipeline=eafit",
      colorVar: "--color-brand-accent",
    },
    {
      key: "cpe",
      label: "Entregado a CPE",
      value: entregadoCpe,
      href: "/sedes?pipeline=cpe",
      colorVar: "--color-status-cumple",
    },
  ];

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-foreground">Flujo de las {total} sedes</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Cada sede cuenta una sola vez, en el punto del flujo donde está ahora mismo. Las insignias
        naranjas son solicitudes dentro de esa categoría (no restan del conteo de la caja).
      </p>
      <div className="flex flex-col items-stretch gap-2 overflow-x-auto pb-2 sm:flex-row sm:flex-wrap sm:items-start">
        {steps.map((step, i) => (
          <div key={step.key} className="flex flex-col items-center gap-2 sm:flex-row">
            <StepBox step={step} />
            {i < steps.length - 1 ? <Connector /> : null}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-foreground-muted">Haz clic en cualquier caja para ver esas sedes en el explorador.</p>
    </div>
  );
}
