CREATE TYPE "public"."actor_tipo" AS ENUM('estudiantes', 'docentes', 'directivos', 'familias');--> statement-breakpoint
CREATE TYPE "public"."extension_valida" AS ENUM('si', 'no', 'no_verificable');--> statement-breakpoint
CREATE TYPE "public"."finding_type" AS ENUM('documento_ausente', 'nomenclatura_incorrecta', 'extension_incorrecta', 'ubicacion_incorrecta', 'duplicado', 'calidad_contenido', 'otro');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('sedes', 'catalogo', 'inventario_sgd');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('en_progreso', 'completado', 'completado_con_errores', 'fallido');--> statement-breakpoint
CREATE TYPE "public"."linea_cpe" AS ENUM('L1', 'L2', 'L3');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('baja', 'media', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pendiente_revision', 'no_esta', 'pendiente_subsanar', 'cumple', 'no_aplica', 'reemplazado');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('activa', 'pendiente_parametrizacion', 'inactiva');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('administrador', 'coordinador', 'revisor', 'consulta');--> statement-breakpoint
CREATE TABLE "applicability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_catalog_id" uuid NOT NULL,
	"linea" "linea_cpe",
	"actor" "actor_tipo",
	"session_count" integer,
	"status" "rule_status" DEFAULT 'activa' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"evidence_name" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT true NOT NULL,
	"allowed_extensions" text[] DEFAULT '{}' NOT NULL,
	"allowed_naming_patterns" text[] DEFAULT '{}' NOT NULL,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"source_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"actor" "actor_tipo",
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sections_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expected_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"actor" "actor_tipo",
	"session_normalized" "linea_cpe",
	"session_original" text,
	"session_number" integer DEFAULT 1 NOT NULL,
	"document_catalog_id" uuid NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_type" text NOT NULL,
	"file_name" text NOT NULL,
	"generated_by" uuid NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer,
	"error_type" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"status" "import_status" DEFAULT 'en_progreso' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dane_code" text NOT NULL,
	"sede_name" text NOT NULL,
	"institution_name" text NOT NULL,
	"department" text NOT NULL,
	"municipality" text NOT NULL,
	"linea" "linea_cpe" NOT NULL,
	"coordinator_name" text,
	"coordinator_profile_id" uuid,
	"mentor_name" text,
	"mentor_identifier" text,
	"sessions_raw" text,
	"sessions_normalized" "linea_cpe",
	"active" boolean DEFAULT true NOT NULL,
	"source_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_dane_sede_unique" UNIQUE("dane_code","sede_name")
);
--> statement-breakpoint
CREATE TABLE "physical_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expected_document_id" uuid,
	"institution_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_extension" text,
	"path_or_link" text,
	"found" boolean DEFAULT true NOT NULL,
	"duplicate" boolean DEFAULT false NOT NULL,
	"extension_valid" "extension_valida" DEFAULT 'no_verificable' NOT NULL,
	"naming_valid" "extension_valida" DEFAULT 'no_verificable' NOT NULL,
	"location_valid" "extension_valida" DEFAULT 'no_verificable' NOT NULL,
	"file_size_bytes" bigint,
	"source_import_id" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'consulta' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expected_document_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"status" "review_status" NOT NULL,
	"observation" text,
	"finding_type" "finding_type",
	"requires_remediation" boolean DEFAULT false NOT NULL,
	"remediation_due_date" date,
	"priority" "priority_level",
	"file_reference" text,
	"closing_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reviewer_assignments_profile_institution_unique" UNIQUE("profile_id","institution_id")
);
--> statement-breakpoint
CREATE TABLE "section_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicability_rules" ADD CONSTRAINT "applicability_rules_document_catalog_id_document_catalog_id_fk" FOREIGN KEY ("document_catalog_id") REFERENCES "public"."document_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_catalog" ADD CONSTRAINT "document_catalog_section_id_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."document_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_documents" ADD CONSTRAINT "expected_documents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_documents" ADD CONSTRAINT "expected_documents_section_id_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."document_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_documents" ADD CONSTRAINT "expected_documents_document_catalog_id_document_catalog_id_fk" FOREIGN KEY ("document_catalog_id") REFERENCES "public"."document_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_generated_by_profiles_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_coordinator_profile_id_profiles_id_fk" FOREIGN KEY ("coordinator_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_expected_document_id_expected_documents_id_fk" FOREIGN KEY ("expected_document_id") REFERENCES "public"."expected_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_expected_document_id_expected_documents_id_fk" FOREIGN KEY ("expected_document_id") REFERENCES "public"."expected_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_section_id_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."document_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_comments" ADD CONSTRAINT "section_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;