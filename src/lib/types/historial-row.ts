import type { ActorTipo, LineaCPE, ReviewStatus } from "@/lib/supabase/database.types";

export interface HistorialRevisionRow {
  review_event_id: string;
  expected_document_id: string;
  sede: string;
  dane_sede: string;
  apartado: string;
  actor: ActorTipo | null;
  sesion: LineaCPE | null;
  evidencia: string;
  estado: ReviewStatus;
  observacion: string | null;
  tipo_hallazgo: string | null;
  requiere_subsanacion: boolean | null;
  fecha_limite_subsanacion: string | null;
  prioridad: string | null;
  revisor: string;
  fecha_revision: string;
}
