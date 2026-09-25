import Link from "next/link";
import { SEDE_OVERALL_STATUS_META, type SedeOverallStatus } from "@/lib/sede-status";

/** Una caja de conteo: numero grande, etiqueta, enlace al explorador filtrado, y
 * opcionalmente una insignia con una sub-cantidad (las solicitudes de re-revision y de
 * segunda revision de SGD no son su propia categoria -- son una cantidad *dentro* de su
 * categoria madre, por eso van como badge y no como caja aparte) o una nota aclaratoria. */
interface StatCard {
  key: string;
  label: string;
  value: number;
  href: string;
  colorVar: string;
  badge?: { label: string; value: number; href: string };
  note?: string;
  isTotal?: boolean;
}

function Card({ card }: { card: StatCard }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Link
        href={card.href}
        className={`flex w-full flex-col items-center rounded-lg border border-border p-4 text-center shadow-sm transition-colors hover:bg-surface-muted ${
          card.isTotal ? "bg-surface-muted" : "bg-surface"
        }`}
      >
        <p className="text-2xl font-semibold" style={{ color: `var(${card.colorVar})` }}>
          {card.value}
        </p>
        <p className="mt-1 text-xs font-medium text-foreground-muted">{card.label}</p>
        {card.note ? <p className="mt-1 text-[10px] text-foreground-muted/70">{card.note}</p> : null}
      </Link>
      {card.badge && card.badge.value > 0 ? (
        <Link
          href={card.badge.href}
          className="rounded-full border border-status-subsanar/40 bg-status-subsanar/10 px-2.5 py-1 text-[11px] font-medium text-status-subsanar hover:bg-status-subsanar/20"
        >
          {card.badge.label}: {card.badge.value}
        </Link>
      ) : null}
    </div>
  );
}

export function SedesFlow({
  total,
  sedeOverallCounts,
  reRevisionPendiente,
  trasladadoSgdTotal,
  pendienteRevisionSgd,
  sgdRechazadoTotal,
  sgdEnSegundaRevision,
  sgdAprobadoSinEafit,
  trasladoEafitSinCpe,
  entregadoCpe,
}: {
  total: number;
  sedeOverallCounts: Record<SedeOverallStatus, number>;
  reRevisionPendiente: number;
  trasladadoSgdTotal: number;
  pendienteRevisionSgd: number;
  sgdRechazadoTotal: number;
  sgdEnSegundaRevision: number;
  sgdAprobadoSinEafit: number;
  trasladoEafitSinCpe: number;
  entregadoCpe: number;
}) {
  const bloque1: StatCard[] = [
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
      key: "total_1",
      label: "Total",
      value: total,
      href: "/sedes",
      colorVar: "--color-foreground",
      isTotal: true,
    },
  ];

  const bloque2: StatCard[] = [
    {
      key: "sgd_pendiente",
      label: "Pendiente de revisión SGD",
      value: pendienteRevisionSgd,
      href: "/sedes?estado=trasladado_sgd&pipeline=sgd_pendiente",
      colorVar: "--color-foreground-muted",
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
      value: sgdAprobadoSinEafit,
      href: "/sedes?pipeline=sgd_aprobado_sin_eafit",
      colorVar: "--color-status-cumple",
      note: "(aprobada, aún sin pasar a EAFIT)",
    },
    {
      key: "eafit",
      label: "Traslado EAFIT",
      value: trasladoEafitSinCpe,
      href: "/sedes?pipeline=eafit_sin_cpe",
      colorVar: "--color-brand-accent",
      note: "(en EAFIT, aún sin llegar a CPE)",
    },
    {
      key: "cpe",
      label: "Entregado a CPE",
      value: entregadoCpe,
      href: "/sedes?pipeline=cpe",
      colorVar: "--color-status-cumple",
    },
    {
      key: "total_2",
      label: "Total",
      value: trasladadoSgdTotal,
      href: "/sedes?estado=trasladado_sgd",
      colorVar: "--color-foreground",
      isTotal: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-base font-semibold text-foreground">Estados de las {total} sedes</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          Cada sede cuenta en exactamente una de estas categorías — ninguna se repite.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {bloque1.map((card) => (
            <Card key={card.key} card={card} />
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="mb-1 text-base font-semibold text-foreground">Después de traslado a SGD</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          Base: <strong>{trasladadoSgdTotal} de {total}</strong> ("{SEDE_OVERALL_STATUS_META.trasladado_sgd.label}" de arriba). También son sedes únicas: ninguna se repite entre estas categorías.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {bloque2.map((card) => (
            <Card key={card.key} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
