-- RevisaSGD — Row Level Security
-- Roles: administrador (todo) · coordinador (su equipo) · revisor (sedes asignadas) · consulta (solo lectura autorizada)

-- ============================================================
-- Helpers
-- ============================================================

create or replace function current_role_name()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'administrador' from profiles where id = auth.uid()), false);
$$;

create or replace function is_coordinador()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'coordinador' from profiles where id = auth.uid()), false);
$$;

create or replace function is_revisor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'revisor' from profiles where id = auth.uid()), false);
$$;

-- Sedes visibles para el usuario autenticado (admin/consulta: todas; coordinador: las de su equipo; revisor: asignadas)
create or replace function visible_institution_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from institutions where is_admin() or (select role from profiles where id = auth.uid()) = 'consulta'
  union
  select id from institutions where coordinator_profile_id = auth.uid() and is_coordinador()
  union
  select institution_id from reviewer_assignments
    where profile_id = auth.uid() and active = true and is_revisor();
$$;

-- ============================================================
-- Enable RLS
-- ============================================================

alter table profiles enable row level security;
alter table institutions enable row level security;
alter table reviewer_assignments enable row level security;
alter table document_sections enable row level security;
alter table document_catalog enable row level security;
alter table applicability_rules enable row level security;
alter table expected_documents enable row level security;
alter table physical_files enable row level security;
alter table review_events enable row level security;
alter table section_comments enable row level security;
alter table imports enable row level security;
alter table import_errors enable row level security;
alter table export_runs enable row level security;
alter table audit_log enable row level security;

-- ============================================================
-- profiles
-- ============================================================

create policy profiles_select on profiles for select
  using (is_admin() or id = auth.uid() or is_coordinador() or is_revisor() or current_role_name() = 'consulta');

create policy profiles_insert_admin on profiles for insert
  with check (is_admin());

create policy profiles_update_admin_or_self on profiles for update
  using (is_admin() or id = auth.uid())
  with check (is_admin() or (id = auth.uid() and role = (select role from profiles p where p.id = auth.uid())));

-- No delete policy: nunca se elimina un perfil, se desactiva (active = false) vía update administrativo.

-- ============================================================
-- institutions (sedes)
-- ============================================================

create policy institutions_select on institutions for select
  using (id in (select visible_institution_ids()));

create policy institutions_write_admin on institutions for insert with check (is_admin());
create policy institutions_update_admin on institutions for update using (is_admin());

-- ============================================================
-- reviewer_assignments
-- ============================================================

create policy reviewer_assignments_select on reviewer_assignments for select
  using (is_admin() or is_coordinador() or profile_id = auth.uid());

create policy reviewer_assignments_write_admin on reviewer_assignments for insert
  with check (is_admin() or is_coordinador());

create policy reviewer_assignments_update_admin on reviewer_assignments for update
  using (is_admin() or is_coordinador());

-- ============================================================
-- document_sections / document_catalog / applicability_rules (catálogo, lectura amplia)
-- ============================================================

create policy document_sections_select on document_sections for select using (true);
create policy document_sections_write_admin on document_sections for insert with check (is_admin());
create policy document_sections_update_admin on document_sections for update using (is_admin());

create policy document_catalog_select on document_catalog for select using (true);
create policy document_catalog_write_admin on document_catalog for insert with check (is_admin());
create policy document_catalog_update_admin on document_catalog for update using (is_admin());

create policy applicability_rules_select on applicability_rules for select using (true);
create policy applicability_rules_write_admin on applicability_rules for insert with check (is_admin());
create policy applicability_rules_update_admin on applicability_rules for update using (is_admin());

-- ============================================================
-- expected_documents
-- ============================================================

create policy expected_documents_select on expected_documents for select
  using (institution_id in (select visible_institution_ids()));

create policy expected_documents_write_admin on expected_documents for insert with check (is_admin());
create policy expected_documents_update_admin on expected_documents for update using (is_admin());

-- ============================================================
-- physical_files
-- ============================================================

create policy physical_files_select on physical_files for select
  using (institution_id in (select visible_institution_ids()));

create policy physical_files_write_admin on physical_files for insert with check (is_admin());
create policy physical_files_update_admin on physical_files for update using (is_admin());

-- ============================================================
-- review_events — INMUTABLE: solo INSERT por revisor/admin sobre sedes asignadas. Sin UPDATE ni DELETE para nadie.
-- ============================================================

create policy review_events_select on review_events for select
  using (
    expected_document_id in (
      select ed.id from expected_documents ed where ed.institution_id in (select visible_institution_ids())
    )
  );

create policy review_events_insert on review_events for insert
  with check (
    reviewer_id = auth.uid()
    and (
      is_admin()
      or (
        is_revisor()
        and expected_document_id in (
          select ed.id from expected_documents ed
          join reviewer_assignments ra on ra.institution_id = ed.institution_id
          where ra.profile_id = auth.uid() and ra.active = true
        )
      )
    )
  );

-- Ninguna policy de UPDATE/DELETE se crea intencionalmente: el historial es append-only.
-- Correcciones administrativas se hacen insertando un nuevo review_event + registro en audit_log, nunca editando uno existente.

-- ============================================================
-- section_comments — versionado (insert-only, igual que review_events)
-- ============================================================

create policy section_comments_select on section_comments for select
  using (institution_id in (select visible_institution_ids()));

create policy section_comments_insert on section_comments for insert
  with check (
    author_id = auth.uid()
    and institution_id in (select visible_institution_ids())
    and (is_admin() or is_coordinador() or is_revisor())
  );

-- ============================================================
-- imports / import_errors / export_runs — administrador y coordinador
-- ============================================================

create policy imports_select on imports for select using (is_admin() or is_coordinador());
create policy imports_insert on imports for insert with check (is_admin());
create policy imports_update on imports for update using (is_admin());

create policy import_errors_select on import_errors for select
  using (is_admin() or is_coordinador());

create policy export_runs_select on export_runs for select
  using (is_admin() or is_coordinador() or generated_by = auth.uid());

-- Cualquier usuario autenticado puede registrar una exportación propia; los datos que
-- efectivamente contiene ya están acotados por las policies SELECT de las tablas fuente.
create policy export_runs_insert on export_runs for insert
  with check (generated_by = auth.uid());

-- ============================================================
-- audit_log — solo administrador lee; el sistema escribe vía funciones security definer
-- ============================================================

create policy audit_log_select_admin on audit_log for select using (is_admin());
create policy audit_log_insert on audit_log for insert with check (auth.uid() is not null);
