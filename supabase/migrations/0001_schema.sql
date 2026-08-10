-- RevisaSGD — esquema inicial (14 tablas base)
-- Convención: identificadores internos en UUID. Códigos DANE siempre como texto.

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('administrador', 'coordinador', 'revisor', 'consulta');

create type review_status as enum (
  'pendiente_revision',
  'no_esta',
  'pendiente_subsanar',
  'cumple',
  'no_aplica',
  'reemplazado'
);

create type linea_cpe as enum ('L1', 'L2', 'L3');

create type actor_tipo as enum ('estudiantes', 'docentes', 'directivos', 'familias');

create type extension_valida as enum ('si', 'no', 'no_verificable');

create type import_kind as enum ('sedes', 'catalogo', 'inventario_sgd');

create type import_status as enum ('en_progreso', 'completado', 'completado_con_errores', 'fallido');

create type rule_status as enum ('activa', 'pendiente_parametrizacion', 'inactiva');

create type finding_type as enum (
  'documento_ausente',
  'nomenclatura_incorrecta',
  'extension_incorrecta',
  'ubicacion_incorrecta',
  'duplicado',
  'calidad_contenido',
  'otro'
);

create type priority_level as enum ('baja', 'media', 'alta', 'urgente');

-- ============================================================
-- 1. profiles — cuentas de usuario (administrador crea/invita, sin registro público)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'consulta',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Perfil de cada una de las 8 cuentas + administrador. No hay registro público.';

-- ============================================================
-- 2. institutions — 306 sedes educativas (fuente: BASE_UNIFICADA_4_COORDINADORES)
-- ============================================================

create table institutions (
  id uuid primary key default gen_random_uuid(),
  dane_code text not null,
  sede_name text not null,
  institution_name text not null,
  department text not null,
  municipality text not null,
  linea linea_cpe not null,
  coordinator_name text,
  coordinator_profile_id uuid references profiles (id),
  mentor_name text,
  mentor_identifier text,
  sessions_raw text,            -- valor tal cual venía en la fuente (ej. "L3 SD2")
  sessions_normalized linea_cpe, -- valor normalizado (ej. "L3")
  active boolean not null default true,
  source_import_id uuid,        -- FK diferida a imports (agregada más abajo)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dane_code, sede_name)
);

create index idx_institutions_dane on institutions (dane_code);
create index idx_institutions_linea on institutions (linea);

comment on column institutions.dane_code is 'Código DANE de la sede, conservado como texto para no perder ceros.';
comment on column institutions.sessions_raw is 'Valor original de sesión, ej. "L3 SD2", conservado para auditoría.';

-- ============================================================
-- 3. reviewer_assignments — asignación revisor/coordinador ↔ sede
-- ============================================================

create table reviewer_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  institution_id uuid not null references institutions (id) on delete cascade,
  assigned_by uuid references profiles (id),
  assigned_at timestamptz not null default now(),
  active boolean not null default true,
  unique (profile_id, institution_id)
);

create index idx_reviewer_assignments_profile on reviewer_assignments (profile_id);
create index idx_reviewer_assignments_institution on reviewer_assignments (institution_id);

-- ============================================================
-- 4. document_sections — subsecciones/apartados (07 Estudiantes, 08 Docentes, 09 Directivos, 10 Familias, etc.)
-- ============================================================

create table document_sections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,   -- ej. '07', '08', '09', '10'
  name text not null,          -- ej. '07 Estudiantes'
  actor actor_tipo,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. document_catalog — catálogo de tipos documentales/evidencias (matrix tipos documentales)
-- ============================================================

create table document_catalog (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references document_sections (id),
  evidence_name text not null,
  description text,
  required boolean not null default true,
  allowed_extensions text[] not null default '{}',
  allowed_naming_patterns text[] not null default '{}',
  catalog_version integer not null default 1,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  source_import_id uuid,
  created_at timestamptz not null default now()
);

create index idx_document_catalog_section on document_catalog (section_id);
create index idx_document_catalog_version on document_catalog (catalog_version);

comment on column document_catalog.allowed_naming_patterns is 'Puede haber varias nomenclaturas válidas para la misma evidencia.';

-- ============================================================
-- 6. applicability_rules — reglas de aplicabilidad por línea/actor/sesión
-- ============================================================

create table applicability_rules (
  id uuid primary key default gen_random_uuid(),
  document_catalog_id uuid not null references document_catalog (id) on delete cascade,
  linea linea_cpe,
  actor actor_tipo,
  session_count integer,        -- número de sesiones esperadas (ej. L1 Estudiantes = 12)
  status rule_status not null default 'activa',
  notes text,
  created_at timestamptz not null default now()
);

create index idx_applicability_rules_catalog on applicability_rules (document_catalog_id);

comment on table applicability_rules is 'Reglas ambiguas deben registrarse con status = pendiente_parametrizacion, nunca inferirse.';

-- ============================================================
-- 7. expected_documents — documento que debería existir (identidad lógica)
-- ============================================================

-- actor y session_normalized son NULL para documentos generales por sede (subsecciones
-- 01-06, 11-14: socialización, diagnósticos, comunicados, cierre, etc., que no están
-- ligados a un actor/sesión). Solo las subsecciones 07-10 (Estudiantes/Docentes/
-- Directivos/Familias) generan un expected_document por cada sesión esperada.
create table expected_documents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions (id) on delete cascade,
  section_id uuid not null references document_sections (id),
  actor actor_tipo,
  session_normalized linea_cpe,
  session_original text,
  session_number integer not null default 1, -- ej. sesión 3 de 12
  document_catalog_id uuid not null references document_catalog (id),
  required boolean not null default true,
  created_at timestamptz not null default now()
);

-- unique index con coalesce: NULL no se compara igual a NULL en un unique constraint
-- normal, así que se fuerza un valor centinela para que sí se detecten duplicados
-- en los documentos generales (actor/sesión nulos).
create unique index uq_expected_documents_identity on expected_documents (
  institution_id,
  section_id,
  coalesce(actor::text, 'general'),
  coalesce(session_normalized::text, 'general'),
  session_number,
  document_catalog_id
);

create index idx_expected_documents_institution on expected_documents (institution_id);
create index idx_expected_documents_catalog on expected_documents (document_catalog_id);

comment on table expected_documents is 'Identidad lógica: sede + subsección + actor + sesión + tipo documental. actor/session_normalized nulos = documento general por sede.';

-- ============================================================
-- 8. physical_files — archivo físico encontrado (inventario SGD importado)
-- ============================================================

create table physical_files (
  id uuid primary key default gen_random_uuid(),
  expected_document_id uuid references expected_documents (id) on delete set null,
  institution_id uuid not null references institutions (id),
  file_name text not null,
  file_extension text,
  path_or_link text,
  found boolean not null default true,
  duplicate boolean not null default false,
  extension_valid extension_valida not null default 'no_verificable',
  naming_valid extension_valida not null default 'no_verificable',
  location_valid extension_valida not null default 'no_verificable',
  file_size_bytes bigint,
  source_import_id uuid,
  imported_at timestamptz not null default now()
);

create index idx_physical_files_expected on physical_files (expected_document_id);
create index idx_physical_files_institution on physical_files (institution_id);

-- ============================================================
-- 9. review_events — historial inmutable de revisiones (nunca update/delete)
-- ============================================================

create table review_events (
  id uuid primary key default gen_random_uuid(),
  expected_document_id uuid not null references expected_documents (id) on delete cascade,
  reviewer_id uuid not null references profiles (id),
  status review_status not null,
  observation text,
  finding_type finding_type,
  requires_remediation boolean not null default false,
  remediation_due_date date,
  priority priority_level,
  file_reference text,
  closing_comment text,
  created_at timestamptz not null default now()
);

create index idx_review_events_expected on review_events (expected_document_id, created_at desc);
create index idx_review_events_reviewer on review_events (reviewer_id);

comment on table review_events is 'INMUTABLE: solo INSERT. El estado actual = último evento por expected_document_id. Ver RLS en 0002.';

-- ============================================================
-- 10. section_comments — comentarios generales por sede/apartado, versionados
-- ============================================================

create table section_comments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions (id) on delete cascade,
  section_id uuid not null references document_sections (id),
  author_id uuid not null references profiles (id),
  comment text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index idx_section_comments_lookup on section_comments (institution_id, section_id, created_at desc);

-- ============================================================
-- 11. imports — control de cargas (sedes, catálogo, inventario)
-- ============================================================

create table imports (
  id uuid primary key default gen_random_uuid(),
  kind import_kind not null,
  file_name text not null,
  uploaded_by uuid not null references profiles (id),
  status import_status not null default 'en_progreso',
  summary jsonb not null default '{}'::jsonb, -- válidos, rechazados, duplicados, nuevos, modificados, desaparecidos
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table institutions add constraint fk_institutions_import foreign key (source_import_id) references imports (id);
alter table document_catalog add constraint fk_catalog_import foreign key (source_import_id) references imports (id);
alter table physical_files add constraint fk_physical_files_import foreign key (source_import_id) references imports (id);

-- ============================================================
-- 12. import_errors — filas rechazadas/ambiguas por importación
-- ============================================================

create table import_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports (id) on delete cascade,
  row_number integer,
  error_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_import_errors_import on import_errors (import_id);

-- ============================================================
-- 13. export_runs — control de exportaciones generadas
-- ============================================================

create table export_runs (
  id uuid primary key default gen_random_uuid(),
  export_type text not null, -- matriz_estado_actual | historial_revisiones | resumen_apartado | productividad | calidad_detalle | calidad_json
  file_name text not null,
  generated_by uuid not null references profiles (id),
  filters jsonb not null default '{}'::jsonb,
  row_count integer,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 14. audit_log — auditoría de correcciones administrativas y acciones sensibles
-- ============================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_entity on audit_log (entity, entity_id);

-- ============================================================
-- Trigger genérico updated_at
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create trigger trg_institutions_updated_at before update on institutions
  for each row execute function set_updated_at();
