-- RevisaSGD — índice de unicidad para expected_documents + vistas para Tableau/indicadores.
-- Portado sin cambios desde supabase/migrations/0003_views.sql: los nombres de tabla/columna
-- son idénticos en el esquema Drizzle, así que este SQL sigue siendo válido tal cual.
--
-- NOTA DE SEGURIDAD: estas vistas ya NO están protegidas por RLS (no hay Supabase Auth/RLS
-- en este proveedor). La cláusula `security_invoker = true` se conserva por compatibilidad
-- futura pero es un no-op sin políticas de RLS activas. El control de acceso vive ahora en
-- la capa de aplicación (ver src/lib/authz/visible-institutions.ts y src/lib/auth/require-role.ts).
-- Cualquier conexión directa a la base de datos (ej. Tableau) ve TODAS las filas de estas
-- vistas sin restricción — usa un rol de solo lectura de Postgres y credenciales controladas.

create unique index if not exists uq_expected_documents_identity on expected_documents (
  institution_id,
  section_id,
  coalesce(actor::text, 'general'),
  coalesce(session_normalized::text, 'general'),
  session_number,
  document_catalog_id
);

create or replace view vw_estado_actual_documentos
with (security_invoker = true) as
with ultimo_evento as (
  select distinct on (expected_document_id)
    expected_document_id,
    status,
    observation,
    reviewer_id,
    remediation_due_date,
    created_at as fecha_ultima_revision
  from review_events
  order by expected_document_id, created_at desc
),
conteo_eventos as (
  select expected_document_id,
         count(*) as numero_revisiones,
         min(created_at) as fecha_primera_revision
  from review_events
  group by expected_document_id
)
select
  ed.id as expected_document_id,
  ed.institution_id,
  i.coordinator_name as coordinador,
  i.department as departamento,
  i.municipality as municipio,
  i.institution_name as institucion,
  i.sede_name as sede,
  i.dane_code as dane_sede,
  i.mentor_name as mentor,
  i.linea,
  ds.name as apartado,
  ed.actor,
  ed.session_normalized as sesion,
  dc.evidence_name as evidencia,
  ed.required as obligatorio,
  dc.allowed_extensions as extension_esperada,
  pf.file_extension as extension_encontrada,
  dc.allowed_naming_patterns as nomenclatura_esperada,
  pf.file_name as nombre_encontrado,
  pf.extension_valid as validacion_extension,
  pf.naming_valid as validacion_nomenclatura,
  coalesce(ue.status, 'pendiente_revision') as estado_actual,
  ue.observation as ultima_observacion,
  coalesce(ce.numero_revisiones, 0) as numero_revisiones,
  p.full_name as ultimo_revisor,
  ce.fecha_primera_revision,
  ue.fecha_ultima_revision,
  ue.remediation_due_date as fecha_limite_subsanacion,
  pf.path_or_link as ruta_archivo
from expected_documents ed
join institutions i on i.id = ed.institution_id
join document_sections ds on ds.id = ed.section_id
join document_catalog dc on dc.id = ed.document_catalog_id
left join physical_files pf on pf.expected_document_id = ed.id
left join ultimo_evento ue on ue.expected_document_id = ed.id
left join conteo_eventos ce on ce.expected_document_id = ed.id
left join profiles p on p.id = ue.reviewer_id;

create or replace view vw_historial_revisiones
with (security_invoker = true) as
select
  re.id as review_event_id,
  ed.id as expected_document_id,
  ed.institution_id,
  i.sede_name as sede,
  i.dane_code as dane_sede,
  ds.name as apartado,
  ed.actor,
  ed.session_normalized as sesion,
  dc.evidence_name as evidencia,
  re.status as estado,
  re.observation as observacion,
  re.finding_type as tipo_hallazgo,
  re.requires_remediation as requiere_subsanacion,
  re.remediation_due_date as fecha_limite_subsanacion,
  re.priority as prioridad,
  p.full_name as revisor,
  re.created_at as fecha_revision
from review_events re
join expected_documents ed on ed.id = re.expected_document_id
join institutions i on i.id = ed.institution_id
join document_sections ds on ds.id = ed.section_id
join document_catalog dc on dc.id = ed.document_catalog_id
join profiles p on p.id = re.reviewer_id;

create or replace view vw_avance_sede_apartado
with (security_invoker = true) as
select
  ed.institution_id,
  i.sede_name as sede,
  i.dane_code as dane_sede,
  i.linea,
  ds.name as apartado,
  count(*) as documentos_esperados,
  count(*) filter (where coalesce(ue.status, 'pendiente_revision') = 'cumple') as documentos_cumple,
  count(*) filter (where coalesce(ue.status, 'pendiente_revision') = 'no_esta') as documentos_no_esta,
  count(*) filter (where coalesce(ue.status, 'pendiente_revision') = 'pendiente_subsanar') as documentos_pendiente_subsanar,
  count(*) filter (where coalesce(ue.status, 'pendiente_revision') = 'pendiente_revision') as documentos_pendiente_revision,
  round(
    100.0 * count(*) filter (where coalesce(ue.status, 'pendiente_revision') = 'cumple') / nullif(count(*), 0),
    1
  ) as porcentaje_cumplimiento
from expected_documents ed
join institutions i on i.id = ed.institution_id
join document_sections ds on ds.id = ed.section_id
left join lateral (
  select status from review_events re
  where re.expected_document_id = ed.id
  order by re.created_at desc
  limit 1
) ue on true
group by ed.institution_id, i.sede_name, i.dane_code, i.linea, ds.name;

create or replace view vw_productividad_revisores
with (security_invoker = true) as
select
  p.id as reviewer_id,
  p.full_name as revisor,
  date_trunc('day', re.created_at) as dia,
  count(*) as acciones_totales,
  count(distinct re.expected_document_id) as documentos_distintos
from review_events re
join profiles p on p.id = re.reviewer_id
group by p.id, p.full_name, date_trunc('day', re.created_at);

create or replace view vw_retrabajo_documental
with (security_invoker = true) as
select
  ed.id as expected_document_id,
  ed.institution_id,
  i.sede_name as sede,
  i.mentor_name as mentor,
  i.coordinator_name as coordinador,
  ds.name as apartado,
  dc.evidence_name as evidencia,
  count(re.id) as numero_revisiones,
  min(re.created_at) as fecha_primera_revision,
  max(re.created_at) as fecha_ultima_revision,
  extract(epoch from (max(re.created_at) - min(re.created_at))) / 86400.0 as dias_hasta_ultimo_evento
from review_events re
join expected_documents ed on ed.id = re.expected_document_id
join institutions i on i.id = ed.institution_id
join document_sections ds on ds.id = ed.section_id
join document_catalog dc on dc.id = ed.document_catalog_id
group by ed.id, ed.institution_id, i.sede_name, i.mentor_name, i.coordinator_name, ds.name, dc.evidence_name
having count(re.id) > 1;

create or replace view vw_pendientes_subsanacion
with (security_invoker = true) as
select
  ed.id as expected_document_id,
  ed.institution_id,
  i.sede_name as sede,
  i.coordinator_name as coordinador,
  i.mentor_name as mentor,
  ds.name as apartado,
  dc.evidence_name as evidencia,
  ue.observation as observacion,
  ue.remediation_due_date as fecha_limite_subsanacion,
  (ue.remediation_due_date is not null and ue.remediation_due_date < current_date) as vencido,
  ue.reviewer_id,
  p.full_name as revisor
from expected_documents ed
join institutions i on i.id = ed.institution_id
join document_sections ds on ds.id = ed.section_id
join document_catalog dc on dc.id = ed.document_catalog_id
join lateral (
  select re.status, re.observation, re.remediation_due_date, re.reviewer_id
  from review_events re
  where re.expected_document_id = ed.id
  order by re.created_at desc
  limit 1
) ue on true
left join profiles p on p.id = ue.reviewer_id
where ue.status = 'pendiente_subsanar';
