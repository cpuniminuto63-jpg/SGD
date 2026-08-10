import type { ReviewStatus } from "@/lib/supabase/database.types";

export interface AvanceSedeApartadoRow {
  institution_id: string;
  sede: string;
  dane_sede: string;
  linea: string;
  apartado: string;
  documentos_esperados: number;
  documentos_cumple: number;
  documentos_no_esta: number;
  documentos_pendiente_subsanar: number;
  documentos_pendiente_revision: number;
  porcentaje_cumplimiento: number | null;
}

export interface ProductividadRevisorRow {
  reviewer_id: string;
  revisor: string;
  dia: string;
  acciones_totales: number;
  documentos_distintos: number;
}

export interface RetrabajoDocumentalRow {
  expected_document_id: string;
  sede: string;
  mentor: string | null;
  coordinador: string | null;
  apartado: string;
  evidencia: string;
  numero_revisiones: number;
  fecha_primera_revision: string;
  fecha_ultima_revision: string;
  dias_hasta_ultimo_evento: number;
}

export interface PendienteSubsanacionRow {
  expected_document_id: string;
  sede: string;
  coordinador: string | null;
  mentor: string | null;
  apartado: string;
  evidencia: string;
  observacion: string | null;
  fecha_limite_subsanacion: string | null;
  vencido: boolean;
  reviewer_id: string | null;
  revisor: string | null;
}

export interface EstadoActualMiniRow {
  estado_actual: ReviewStatus;
  numero_revisiones: number;
}
