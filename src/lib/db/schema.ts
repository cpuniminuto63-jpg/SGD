// Esquema Drizzle — espejo de supabase/migrations/0001_schema.sql, adaptado para
// Vercel Postgres + NextAuth (sin Supabase Auth/RLS). Ver docs/migracion-vercel-postgres.md
// para el porqué del cambio de proveedor y sus implicaciones de seguridad.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  jsonb,
  date,
  unique,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "administrador",
  "coordinador",
  "revisor",
  "consulta",
  // "sgd": revisa las sedes que ya llegaron a "Trasladado a revisión SGD" y las marca
  // como "Traslado EAFIT". "coordinador_eafit": recibe esas sedes y las marca como
  // "Entregado a CPE" — dos etapas nuevas después del ciclo de revisión interna
  // (2026-09-01, a pedido del usuario). Ver src/lib/authz/visible-institutions.ts.
  "sgd",
  "coordinador_eafit",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pendiente_revision",
  "no_esta",
  "pendiente_subsanar",
  "volver_a_campo",
  "cumple",
  "no_aplica",
  "reemplazado",
]);
export const lineaCpeEnum = pgEnum("linea_cpe", ["L1", "L2", "L3"]);
export const actorTipoEnum = pgEnum("actor_tipo", ["estudiantes", "docentes", "directivos", "familias"]);
export const extensionValidaEnum = pgEnum("extension_valida", ["si", "no", "no_verificable"]);
export const importKindEnum = pgEnum("import_kind", ["sedes", "catalogo", "inventario_sgd"]);
export const importStatusEnum = pgEnum("import_status", [
  "en_progreso",
  "completado",
  "completado_con_errores",
  "fallido",
]);
export const ruleStatusEnum = pgEnum("rule_status", ["activa", "pendiente_parametrizacion", "inactiva"]);
export const findingTypeEnum = pgEnum("finding_type", [
  "documento_ausente",
  "nomenclatura_incorrecta",
  "extension_incorrecta",
  "ubicacion_incorrecta",
  "duplicado",
  "calidad_contenido",
  "otro",
]);
export const priorityLevelEnum = pgEnum("priority_level", ["baja", "media", "alta", "urgente"]);

// 1. profiles — ya no referencia auth.users (Supabase); la identidad la gestiona NextAuth.
// password_hash es nullable: una cuenta invitada no tiene clave hasta que la activa.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("consulta"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 2. institutions — 306 sedes (fuente: BASE_UNIFICADA_4_COORDINADORES)
export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ID de la fila en el archivo maestro original (columna "ID"), para poder buscar
    // la sede por ese identificador además de por código DANE.
    sourceRowId: text("source_row_id"),
    daneCode: text("dane_code").notNull(),
    sedeName: text("sede_name").notNull(),
    institutionName: text("institution_name").notNull(),
    department: text("department").notNull(),
    municipality: text("municipality").notNull(),
    linea: lineaCpeEnum("linea").notNull(),
    coordinatorName: text("coordinator_name"),
    coordinatorProfileId: uuid("coordinator_profile_id").references(() => profiles.id),
    mentorName: text("mentor_name"),
    mentorIdentifier: text("mentor_identifier"),
    sessionsRaw: text("sessions_raw"),
    sessionsNormalized: lineaCpeEnum("sessions_normalized"),
    active: boolean("active").notNull().default(true),
    sourceImportId: uuid("source_import_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // Marca de "volver a revisar" (2026-09-01): una coordinación con esta sede en su
    // alcance la marca cuando quiere que el revisor asignado vuelva a dejar veredicto
    // en los documentos que no están en "Cumple". Es solo una alerta — no reinicia el
    // estado de ningún documento. reReviewPendingDocumentIds guarda los IDs de
    // expected_documents que estaban fuera de "Cumple" al momento de marcar; cada uno
    // se quita de la lista cuando llega un review_event nuevo para ese documento, y al
    // vaciarse se limpia la marca automáticamente (ver mi-bandeja/actions.ts).
    reReviewRequestedAt: timestamp("re_review_requested_at", { withTimezone: true }),
    reReviewRequestedBy: uuid("re_review_requested_by").references(() => profiles.id),
    reReviewPendingDocumentIds: jsonb("re_review_pending_document_ids").$type<string[]>(),

    // Etapas posteriores a "Trasladado a revisión SGD" (2026-09-01): una sede llega
    // aquí sola cuando todos sus apartados quedan en "Cumple" (ver sede-status.ts);
    // de ahí en adelante son marcas manuales, en orden, hechas por los roles "sgd" y
    // "coordinador_eafit" respectivamente.
    traspasoEafitAt: timestamp("traspaso_eafit_at", { withTimezone: true }),
    traspasoEafitBy: uuid("traspaso_eafit_by").references(() => profiles.id),
    entregadoCpeAt: timestamp("entregado_cpe_at", { withTimezone: true }),
    entregadoCpeBy: uuid("entregado_cpe_by").references(() => profiles.id),
  },
  (t) => [unique("institutions_dane_sede_unique").on(t.daneCode, t.sedeName)]
);

// 3. reviewer_assignments
export const reviewerAssignments = pgTable(
  "reviewer_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => profiles.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [unique("reviewer_assignments_profile_institution_unique").on(t.profileId, t.institutionId)]
);

// 3b. coordinator_scopes — a qué sedes tiene acceso amplio ("Explorador de sedes") cada
// coordinador. Reemplaza a institutions.coordinator_profile_id (que solo admitía un dueño
// por sede) por una relación de muchos-a-muchos: varios coordinadores pueden compartir la
// misma sede sin quitársela a nadie. institutions.coordinator_profile_id se conserva solo
// como referencia histórica de quién era el dueño original; ya no se usa para autorización
// (ver src/lib/authz/visible-institutions.ts).
export const coordinatorScopes = pgTable(
  "coordinator_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => profiles.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [unique("coordinator_scopes_profile_institution_unique").on(t.profileId, t.institutionId)]
);

// 4. document_sections — apartados (01_SOCIALIZACION ... 14_CIERRE_INST)
export const documentSections = pgTable("document_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  actor: actorTipoEnum("actor"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 5. document_catalog — catálogo de tipos documentales/evidencias
export const documentCatalog = pgTable("document_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => documentSections.id),
  evidenceName: text("evidence_name").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  // false = un solo documento esperado por sede/apartado/actor (ej. lista de asistencia
  // física, registro Qualtrics), en vez de repetirse por cada sesión.
  perSession: boolean("per_session").notNull().default(true),
  allowedExtensions: text("allowed_extensions").array().notNull().default([]),
  allowedNamingPatterns: text("allowed_naming_patterns").array().notNull().default([]),
  catalogVersion: integer("catalog_version").notNull().default(1),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  sourceImportId: uuid("source_import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 6. applicability_rules
export const applicabilityRules = pgTable("applicability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentCatalogId: uuid("document_catalog_id")
    .notNull()
    .references(() => documentCatalog.id, { onDelete: "cascade" }),
  linea: lineaCpeEnum("linea"),
  actor: actorTipoEnum("actor"),
  sessionCount: integer("session_count"),
  status: ruleStatusEnum("status").notNull().default("activa"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 7. expected_documents — actor/session_normalized nulos = documento general por sede.
// La unicidad real (con coalesce para tratar NULL de forma consistente) se aplica vía
// índice expresado en SQL — ver drizzle/0000_*.sql generado, no representable 1:1 en el
// builder de Drizzle sin `sql` crudo; documentado aquí para quien mantenga el esquema.
export const expectedDocuments = pgTable("expected_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => documentSections.id),
  actor: actorTipoEnum("actor"),
  sessionNormalized: lineaCpeEnum("session_normalized"),
  sessionOriginal: text("session_original"),
  sessionNumber: integer("session_number").notNull().default(1),
  documentCatalogId: uuid("document_catalog_id")
    .notNull()
    .references(() => documentCatalog.id),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 8. physical_files
export const physicalFiles = pgTable("physical_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  expectedDocumentId: uuid("expected_document_id").references(() => expectedDocuments.id, {
    onDelete: "set null",
  }),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institutions.id),
  fileName: text("file_name").notNull(),
  fileExtension: text("file_extension"),
  pathOrLink: text("path_or_link"),
  found: boolean("found").notNull().default(true),
  duplicate: boolean("duplicate").notNull().default(false),
  extensionValid: extensionValidaEnum("extension_valid").notNull().default("no_verificable"),
  namingValid: extensionValidaEnum("naming_valid").notNull().default("no_verificable"),
  locationValid: extensionValidaEnum("location_valid").notNull().default("no_verificable"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  sourceImportId: uuid("source_import_id"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

// 9. review_events — INMUTABLE: la app nunca debe hacer UPDATE/DELETE sobre esta tabla
// (ya no hay RLS que lo impida a nivel de base de datos; ver docs/migracion-vercel-postgres.md).
export const reviewEvents = pgTable("review_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  expectedDocumentId: uuid("expected_document_id")
    .notNull()
    .references(() => expectedDocuments.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => profiles.id),
  status: reviewStatusEnum("status").notNull(),
  observation: text("observation"),
  findingType: findingTypeEnum("finding_type"),
  requiresRemediation: boolean("requires_remediation").notNull().default(false),
  remediationDueDate: date("remediation_due_date"),
  priority: priorityLevelEnum("priority"),
  fileReference: text("file_reference"),
  closingComment: text("closing_comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 10. section_comments — versionado (insert-only por convención de aplicación)
export const sectionComments = pgTable("section_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => documentSections.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  comment: text("comment").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 10b. section_reviews — veredicto manual por sede+apartado (insert-only, igual que
// review_events): permite marcar un apartado completo como Cumple/Pendiente por
// subsanar/etc. sin tener que revisar documento por documento. El estado vigente de
// un apartado es el último evento; cuando TODOS los apartados de una sede quedan en
// 'cumple' la sede se considera "Trasladada a revisión SGD" (estado derivado, no
// almacenado — ver src/lib/sede-status.ts).
export const sectionReviews = pgTable("section_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => documentSections.id),
  status: reviewStatusEnum("status").notNull(),
  comment: text("comment"),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 11. imports
export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: importKindEnum("kind").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => profiles.id),
  status: importStatusEnum("status").notNull().default("en_progreso"),
  summary: jsonb("summary").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 12. import_errors
export const importErrors = pgTable("import_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  importId: uuid("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number"),
  errorType: text("error_type").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 13. export_runs
export const exportRuns = pgTable("export_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  exportType: text("export_type").notNull(),
  fileName: text("file_name").notNull(),
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => profiles.id),
  filters: jsonb("filters").notNull().default({}),
  rowCount: integer("row_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 14. audit_log
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 12. profile_pings — un latido cada pocos minutos por persona activa (ver
// src/proxy.ts), insert-only, solo para saber cuánta gente usa la app al tiempo
// (planeación de infraestructura), no para nada de negocio.
export const profilePings = pgTable("profile_pings", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
