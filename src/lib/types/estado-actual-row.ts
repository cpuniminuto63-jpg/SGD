import type { ActorTipo, LineaCPE, ReviewStatus } from "@/lib/db/types";

export interface EstadoActualRow {
  expected_document_id: string;
  institution_id: string;
  coordinador: string | null;
  departamento: string;
  municipio: string;
  institucion: string;
  sede: string;
  dane_sede: string;
  mentor: string | null;
  linea: LineaCPE;
  apartado: string;
  actor: ActorTipo | null;
  sesion: LineaCPE | null;
  numero_sesion: number | null;
  evidencia: string;
  obligatorio: boolean;
  estado_actual: ReviewStatus;
  ultima_observacion: string | null;
  numero_revisiones: number;
  ultimo_revisor: string | null;
  fecha_primera_revision: string | null;
  fecha_ultima_revision: string | null;
  fecha_limite_subsanacion: string | null;
  ruta_archivo: string | null;
}
