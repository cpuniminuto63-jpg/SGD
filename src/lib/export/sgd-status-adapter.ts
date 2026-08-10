import type { ReviewStatus } from "@/lib/supabase/database.types";

/**
 * Contrato de integración con la app SGD legacy (sección 14 del prompt maestro).
 *
 * RevisaSGD maneja 6 estados de revisión (`ReviewStatus`), pero la app SGD legacy
 * espera su propio vocabulario de "Estado_calidad" en el archivo
 * `calidad_documental_detalle.csv`. No tenemos acceso directo al vocabulario exacto
 * que usa SGD, así que este mapeo es una suposición razonable que debe ser
 * confirmada por alguien con acceso al sistema legacy antes de depender de él
 * en producción:
 *
 *   cumple               -> "Cumple"
 *   pendiente_subsanar    -> "Pendiente"
 *   no_esta               -> "No cumple"
 *   no_aplica              -> "No aplica"
 *   reemplazado            -> "Cumple"   (el documento reemplazado ya cumple)
 *   pendiente_revision     -> "Pendiente" (aún no evaluado, se reporta como pendiente)
 *
 * Si el vocabulario real de SGD difiere, ajustar únicamente este archivo:
 * el resto del exportador no depende de los valores concretos.
 */
export const SGD_STATUS_MAP: Record<ReviewStatus, string> = {
  cumple: "Cumple",
  pendiente_subsanar: "Pendiente",
  no_esta: "No cumple",
  no_aplica: "No aplica",
  reemplazado: "Cumple",
  pendiente_revision: "Pendiente",
};

/** Traduce un estado de RevisaSGD al vocabulario esperado por la app SGD legacy. */
export function toSgdStatus(status: ReviewStatus): string {
  return SGD_STATUS_MAP[status] ?? "Pendiente";
}
