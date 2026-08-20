import { SESSION_COUNTS } from "@/lib/import/session-rules";
import type { ActorTipo, LineaCPE } from "@/lib/db/types";

export interface ExpectedDocumentsInstitution {
  id: string;
  linea: LineaCPE;
}

export interface ExpectedDocumentsCatalogEntry {
  id: string;
  sectionId: string;
  actor: ActorTipo | null;
  required: boolean;
  /** false = un solo documento por sede/apartado/actor, no uno por cada sesión. */
  perSession: boolean;
}

export interface GeneratedExpectedDocument {
  institution_id: string;
  section_id: string;
  actor: ActorTipo | null;
  session_normalized: LineaCPE | null;
  session_number: number;
  document_catalog_id: string;
  required: boolean;
}

/**
 * Genera los documentos esperados (identidad: sede + subsección + actor + sesión + tipo
 * documental) a partir de las sedes importadas y el catálogo documental importado.
 *
 * - Entradas del catálogo con actor (subsecciones 07-10): se genera un expected_document
 *   por cada sesión esperada según la línea de la sede (ver session-rules.ts).
 * - Entradas del catálogo sin actor (documentos generales por sede): un único
 *   expected_document por sede, sesión 1.
 */
export function generateExpectedDocuments(
  institutions: ExpectedDocumentsInstitution[],
  catalogEntries: ExpectedDocumentsCatalogEntry[]
): GeneratedExpectedDocument[] {
  const rows: GeneratedExpectedDocument[] = [];

  for (const institution of institutions) {
    for (const entry of catalogEntries) {
      if (entry.actor && entry.perSession) {
        const sessionCount = SESSION_COUNTS[institution.linea][entry.actor];
        for (let sessionNumber = 1; sessionNumber <= sessionCount; sessionNumber++) {
          rows.push({
            institution_id: institution.id,
            section_id: entry.sectionId,
            actor: entry.actor,
            session_normalized: institution.linea,
            session_number: sessionNumber,
            document_catalog_id: entry.id,
            required: entry.required,
          });
        }
      } else if (entry.actor && !entry.perSession) {
        // Un único documento para todo el apartado de este actor (no se repite por sesión).
        rows.push({
          institution_id: institution.id,
          section_id: entry.sectionId,
          actor: entry.actor,
          session_normalized: institution.linea,
          session_number: 1,
          document_catalog_id: entry.id,
          required: entry.required,
        });
      } else {
        rows.push({
          institution_id: institution.id,
          section_id: entry.sectionId,
          actor: null,
          session_normalized: null,
          session_number: 1,
          document_catalog_id: entry.id,
          required: entry.required,
        });
      }
    }
  }

  return rows;
}
