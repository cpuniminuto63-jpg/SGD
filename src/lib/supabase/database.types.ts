// Tipos escritos a mano a partir de supabase/migrations/000*.sql.
// Reemplazar por `supabase gen types typescript` en cuanto el proyecto Supabase exista.
// Nota: cada tabla incluye `Relationships: []` y el schema incluye `Functions: {}` porque
// @supabase/postgrest-js exige esa forma (GenericTable / GenericSchema); sin ellos TS
// colapsa todos los tipos de fila a `never`.

export type UserRole = "administrador" | "coordinador" | "revisor" | "consulta";

export type ReviewStatus =
  | "pendiente_revision"
  | "no_esta"
  | "pendiente_subsanar"
  | "cumple"
  | "no_aplica"
  | "reemplazado";

export type LineaCPE = "L1" | "L2" | "L3";
export type ActorTipo = "estudiantes" | "docentes" | "directivos" | "familias";
export type ExtensionValida = "si" | "no" | "no_verificable";
export type ImportKind = "sedes" | "catalogo" | "inventario_sgd";
export type ImportStatus = "en_progreso" | "completado" | "completado_con_errores" | "fallido";
export type RuleStatus = "activa" | "pendiente_parametrizacion" | "inactiva";
export type FindingType =
  | "documento_ausente"
  | "nomenclatura_incorrecta"
  | "extension_incorrecta"
  | "ubicacion_incorrecta"
  | "duplicado"
  | "calidad_contenido"
  | "otro";
export type PriorityLevel = "baja" | "media" | "alta" | "urgente";

type Tables = Database["public"]["Tables"];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: UserRole;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Tables["profiles"]["Row"]> & {
          id: string;
          full_name: string;
          email: string;
        };
        Update: Partial<Tables["profiles"]["Row"]>;
        Relationships: [];
      };
      institutions: {
        Row: {
          id: string;
          dane_code: string;
          sede_name: string;
          institution_name: string;
          department: string;
          municipality: string;
          linea: LineaCPE;
          coordinator_name: string | null;
          coordinator_profile_id: string | null;
          mentor_name: string | null;
          mentor_identifier: string | null;
          sessions_raw: string | null;
          sessions_normalized: LineaCPE | null;
          active: boolean;
          source_import_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Tables["institutions"]["Row"]> & {
          dane_code: string;
          sede_name: string;
          institution_name: string;
          department: string;
          municipality: string;
          linea: LineaCPE;
        };
        Update: Partial<Tables["institutions"]["Row"]>;
        Relationships: [];
      };
      reviewer_assignments: {
        Row: {
          id: string;
          profile_id: string;
          institution_id: string;
          assigned_by: string | null;
          assigned_at: string;
          active: boolean;
        };
        Insert: Partial<Tables["reviewer_assignments"]["Row"]> & {
          profile_id: string;
          institution_id: string;
        };
        Update: Partial<Tables["reviewer_assignments"]["Row"]>;
        Relationships: [];
      };
      document_sections: {
        Row: {
          id: string;
          code: string;
          name: string;
          actor: ActorTipo | null;
          display_order: number;
          created_at: string;
        };
        Insert: Partial<Tables["document_sections"]["Row"]> & {
          code: string;
          name: string;
        };
        Update: Partial<Tables["document_sections"]["Row"]>;
        Relationships: [];
      };
      document_catalog: {
        Row: {
          id: string;
          section_id: string;
          evidence_name: string;
          description: string | null;
          required: boolean;
          allowed_extensions: string[];
          allowed_naming_patterns: string[];
          catalog_version: number;
          valid_from: string;
          valid_to: string | null;
          source_import_id: string | null;
          created_at: string;
        };
        Insert: Partial<Tables["document_catalog"]["Row"]> & {
          section_id: string;
          evidence_name: string;
        };
        Update: Partial<Tables["document_catalog"]["Row"]>;
        Relationships: [];
      };
      applicability_rules: {
        Row: {
          id: string;
          document_catalog_id: string;
          linea: LineaCPE | null;
          actor: ActorTipo | null;
          session_count: number | null;
          status: RuleStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Tables["applicability_rules"]["Row"]> & {
          document_catalog_id: string;
        };
        Update: Partial<Tables["applicability_rules"]["Row"]>;
        Relationships: [];
      };
      expected_documents: {
        Row: {
          id: string;
          institution_id: string;
          section_id: string;
          actor: ActorTipo | null;
          session_normalized: LineaCPE | null;
          session_original: string | null;
          session_number: number;
          document_catalog_id: string;
          required: boolean;
          created_at: string;
        };
        Insert: Partial<Tables["expected_documents"]["Row"]> & {
          institution_id: string;
          section_id: string;
          document_catalog_id: string;
        };
        Update: Partial<Tables["expected_documents"]["Row"]>;
        Relationships: [];
      };
      physical_files: {
        Row: {
          id: string;
          expected_document_id: string | null;
          institution_id: string;
          file_name: string;
          file_extension: string | null;
          path_or_link: string | null;
          found: boolean;
          duplicate: boolean;
          extension_valid: ExtensionValida;
          naming_valid: ExtensionValida;
          location_valid: ExtensionValida;
          file_size_bytes: number | null;
          source_import_id: string | null;
          imported_at: string;
        };
        Insert: Partial<Tables["physical_files"]["Row"]> & {
          institution_id: string;
          file_name: string;
        };
        Update: Partial<Tables["physical_files"]["Row"]>;
        Relationships: [];
      };
      review_events: {
        Row: {
          id: string;
          expected_document_id: string;
          reviewer_id: string;
          status: ReviewStatus;
          observation: string | null;
          finding_type: FindingType | null;
          requires_remediation: boolean;
          remediation_due_date: string | null;
          priority: PriorityLevel | null;
          file_reference: string | null;
          closing_comment: string | null;
          created_at: string;
        };
        Insert: Partial<Tables["review_events"]["Row"]> & {
          expected_document_id: string;
          reviewer_id: string;
          status: ReviewStatus;
        };
        // Sin Update real intencionalmente: review_events es insert-only (ver 0002_rls.sql).
        Update: Record<string, never>;
        Relationships: [];
      };
      section_comments: {
        Row: {
          id: string;
          institution_id: string;
          section_id: string;
          author_id: string;
          comment: string;
          version: number;
          created_at: string;
        };
        Insert: Partial<Tables["section_comments"]["Row"]> & {
          institution_id: string;
          section_id: string;
          author_id: string;
          comment: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      imports: {
        Row: {
          id: string;
          kind: ImportKind;
          file_name: string;
          uploaded_by: string;
          status: ImportStatus;
          summary: Record<string, unknown>;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Tables["imports"]["Row"]> & {
          kind: ImportKind;
          file_name: string;
          uploaded_by: string;
        };
        Update: Partial<Tables["imports"]["Row"]>;
        Relationships: [];
      };
      import_errors: {
        Row: {
          id: string;
          import_id: string;
          row_number: number | null;
          error_type: string;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Tables["import_errors"]["Row"]> & {
          import_id: string;
          error_type: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      export_runs: {
        Row: {
          id: string;
          export_type: string;
          file_name: string;
          generated_by: string;
          filters: Record<string, unknown>;
          row_count: number | null;
          created_at: string;
        };
        Insert: Partial<Tables["export_runs"]["Row"]> & {
          export_type: string;
          file_name: string;
          generated_by: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Partial<Tables["audit_log"]["Row"]> & {
          action: string;
          entity: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      vw_estado_actual_documentos: { Row: Record<string, unknown>; Relationships: [] };
      vw_historial_revisiones: { Row: Record<string, unknown>; Relationships: [] };
      vw_avance_sede_apartado: { Row: Record<string, unknown>; Relationships: [] };
      vw_productividad_revisores: { Row: Record<string, unknown>; Relationships: [] };
      vw_retrabajo_documental: { Row: Record<string, unknown>; Relationships: [] };
      vw_pendientes_subsanacion: { Row: Record<string, unknown>; Relationships: [] };
    };
    Functions: Record<string, never>;
  };
}
