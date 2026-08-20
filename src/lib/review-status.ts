import type { ReviewStatus } from "@/lib/db/types";

export const REVIEW_STATUS_META: Record<
  ReviewStatus,
  { label: string; colorVar: string; requiresObservation: boolean }
> = {
  pendiente_revision: {
    label: "Pendiente de revisión",
    colorVar: "--color-status-pendiente",
    requiresObservation: false,
  },
  no_esta: {
    label: "No hay documentación en la carpeta",
    colorVar: "--color-status-no-esta",
    requiresObservation: true,
  },
  pendiente_subsanar: {
    label: "Pendiente por subsanar",
    colorVar: "--color-status-subsanar",
    requiresObservation: true,
  },
  volver_a_campo: {
    label: "Volver a campo",
    colorVar: "--color-status-volver-campo",
    requiresObservation: true,
  },
  cumple: {
    label: "Cumple",
    colorVar: "--color-status-cumple",
    requiresObservation: false,
  },
  no_aplica: {
    label: "No aplica",
    colorVar: "--color-status-no-aplica",
    requiresObservation: true,
  },
  reemplazado: {
    label: "Reemplazado",
    colorVar: "--color-status-reemplazado",
    requiresObservation: true,
  },
};

/** Estados seleccionables en los formularios. "no_aplica" y "reemplazado" se quitaron
 * de aquí a pedido del usuario (2026-08-19) — siguen existiendo en el enum de la base
 * de datos y en REVIEW_STATUS_META para poder seguir mostrando el historial de
 * documentos que ya tenían esos estados, pero ya no se pueden volver a elegir. */
export const REVIEW_STATUS_ORDER: ReviewStatus[] = [
  "pendiente_revision",
  "no_esta",
  "pendiente_subsanar",
  "volver_a_campo",
  "cumple",
];

/** Todos los estados que pueden existir en datos históricos (incluye los retirados de
 * REVIEW_STATUS_ORDER). Úsalo para inicializar conteos/tablas — nunca para <select>. */
export const ALL_REVIEW_STATUSES: ReviewStatus[] = [...REVIEW_STATUS_ORDER, "no_aplica", "reemplazado"];
