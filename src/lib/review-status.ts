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
    label: "No está el documento",
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

export const REVIEW_STATUS_ORDER: ReviewStatus[] = [
  "pendiente_revision",
  "no_esta",
  "pendiente_subsanar",
  "volver_a_campo",
  "cumple",
  "no_aplica",
  "reemplazado",
];
