# Diccionario de datos — RevisaSGD

Basado estrictamente en `supabase/migrations/0001_schema.sql` (tablas) y `supabase/migrations/0003_views.sql` (vistas). Los tipos son los definidos en Postgres; "PK"/"FK" indican llave primaria/foránea.

## Tipos enumerados (`enum`)

| Tipo | Valores |
|---|---|
| `user_role` | `administrador`, `coordinador`, `revisor`, `consulta` |
| `review_status` | `pendiente_revision`, `no_esta`, `pendiente_subsanar`, `cumple`, `no_aplica`, `reemplazado` |
| `linea_cpe` | `L1`, `L2`, `L3` |
| `actor_tipo` | `estudiantes`, `docentes`, `directivos`, `familias` |
| `extension_valida` | `si`, `no`, `no_verificable` |
| `import_kind` | `sedes`, `catalogo`, `inventario_sgd` |
| `import_status` | `en_progreso`, `completado`, `completado_con_errores`, `fallido` |
| `rule_status` | `activa`, `pendiente_parametrizacion`, `inactiva` |
| `finding_type` | `documento_ausente`, `nomenclatura_incorrecta`, `extension_incorrecta`, `ubicacion_incorrecta`, `duplicado`, `calidad_contenido`, `otro` |
| `priority_level` | `baja`, `media`, `alta`, `urgente` |

---

## 1. `profiles`

Perfil de cada una de las 8 cuentas iniciales + administrador. No hay registro público.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Igual al `id` de `auth.users`; vínculo 1:1 con la cuenta de autenticación. |
| `full_name` | `text` | No | Nombre completo de la persona. |
| `email` | `text` (único) | No | Correo institucional. |
| `role` | `user_role` | No (default `consulta`) | Rol funcional dentro de RevisaSGD. |
| `active` | `boolean` | No (default `true`) | Si es `false`, la cuenta no puede iniciar sesión (se desactiva, nunca se borra). |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de creación del perfil. |
| `updated_at` | `timestamptz` | No (default `now()`) | Se actualiza automáticamente por trigger en cada `UPDATE`. |

## 2. `institutions`

306 sedes educativas, cargadas desde BASE_UNIFICADA_4_COORDINADORES. Único por `(dane_code, sede_name)`.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador interno de la sede. |
| `dane_code` | `text` | No | Código DANE de la sede, guardado como texto para no perder ceros a la izquierda. |
| `sede_name` | `text` | No | Nombre de la sede educativa. |
| `institution_name` | `text` | No | Nombre de la institución educativa (EE) a la que pertenece la sede. |
| `department` | `text` | No | Departamento. |
| `municipality` | `text` | No | Municipio. |
| `linea` | `linea_cpe` | No | Línea CPE de la sede (L1/L2/L3), determina las reglas de sesión aplicables. |
| `coordinator_name` | `text` | Sí | Nombre del coordinador según la fuente (texto libre, no necesariamente vinculado a una cuenta). |
| `coordinator_profile_id` | `uuid` (FK → `profiles.id`) | Sí | Cuenta de coordinador vinculada; usada por RLS para determinar visibilidad. |
| `mentor_name` | `text` | Sí | Nombre del mentor asignado a la sede. |
| `mentor_identifier` | `text` | Sí | Identificador del mentor en la fuente; si falta, la fila se marca como observación en la importación (no bloqueante). |
| `sessions_raw` | `text` | Sí | Valor original de sesión tal como venía en la fuente (ej. `"L3 SD2"`), conservado para auditoría. |
| `sessions_normalized` | `linea_cpe` | Sí | Valor normalizado de la línea/sesión. |
| `active` | `boolean` | No (default `true`) | Si la sede sigue activa dentro del alcance del proyecto. |
| `source_import_id` | `uuid` (FK → `imports.id`) | Sí | Importación que originó/actualizó este registro. |
| `created_at` / `updated_at` | `timestamptz` | No | Auditoría de creación/modificación (trigger). |

## 3. `reviewer_assignments`

Asignación revisor/coordinador ↔ sede. Único por `(profile_id, institution_id)`.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador de la asignación. |
| `profile_id` | `uuid` (FK → `profiles.id`) | No | Usuario asignado (revisor o coordinador). |
| `institution_id` | `uuid` (FK → `institutions.id`) | No | Sede asignada. |
| `assigned_by` | `uuid` (FK → `profiles.id`) | Sí | Quién hizo la asignación. |
| `assigned_at` | `timestamptz` | No (default `now()`) | Cuándo se hizo/actualizó la asignación. |
| `active` | `boolean` | No (default `true`) | Si `false`, la sede deja de ser visible para ese usuario sin borrar el historial previo. |

## 4. `document_sections`

Subsecciones/apartados del catálogo documental (ej. "07 Estudiantes").

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador de la subsección. |
| `code` | `text` (único) | No | Código de la subsección, ej. `'07'`. |
| `name` | `text` | No | Nombre visible, ej. `'07 Estudiantes'`. |
| `actor` | `actor_tipo` | Sí | Actor asociado, si aplica (subsecciones 07-10); `NULL` para apartados generales. |
| `display_order` | `integer` | No (default `0`) | Orden de despliegue en la interfaz. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de creación. |

## 5. `document_catalog`

Catálogo de tipos documentales/evidencias esperadas (matriz de tipos documentales).

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del tipo documental. |
| `section_id` | `uuid` (FK → `document_sections.id`) | No | Subsección a la que pertenece. |
| `evidence_name` | `text` | No | Nombre/descripción de la evidencia esperada. |
| `description` | `text` | Sí | Descripción adicional (heredada de la columna de descripción de la subsección). |
| `required` | `boolean` | No (default `true`) | Si el documento es obligatorio. |
| `allowed_extensions` | `text[]` | No (default `{}`) | Extensiones de archivo válidas, inferidas del texto de la evidencia. |
| `allowed_naming_patterns` | `text[]` | No (default `{}`) | Nomenclaturas válidas; puede haber varias para la misma evidencia. |
| `catalog_version` | `integer` | No (default `1`) | Versión del catálogo (para futuras revisiones del catálogo documental). |
| `valid_from` | `timestamptz` | No (default `now()`) | Desde cuándo esta entrada de catálogo está vigente. |
| `valid_to` | `timestamptz` | Sí | Hasta cuándo estuvo vigente (`NULL` = vigente actualmente). |
| `source_import_id` | `uuid` (FK → `imports.id`) | Sí | Importación que originó esta entrada. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de creación. |

## 6. `applicability_rules`

Reglas de aplicabilidad por línea/actor/sesión para una entrada de catálogo. Reglas ambiguas deben registrarse con `status = pendiente_parametrizacion`, nunca inferirse.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador de la regla. |
| `document_catalog_id` | `uuid` (FK → `document_catalog.id`) | No | Tipo documental al que aplica la regla. |
| `linea` | `linea_cpe` | Sí | Línea a la que aplica (si es específica de una línea). |
| `actor` | `actor_tipo` | Sí | Actor al que aplica (si es específico de un actor). |
| `session_count` | `integer` | Sí | Número de sesiones esperadas (ej. L1 Estudiantes = 12). |
| `status` | `rule_status` | No (default `activa`) | Si la regla está activa, inactiva, o pendiente de que un administrador la parametrice. |
| `notes` | `text` | Sí | Notas libres sobre la regla. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de creación. |

## 7. `expected_documents`

El documento que debería existir para una sede, según catálogo y reglas de sesión. **Identidad lógica**: sede + subsección + actor + sesión + tipo documental (reforzada por índice único). `actor` y `session_normalized` son `NULL` para documentos generales por sede (subsecciones 01-06, 11-14: socialización, diagnósticos, comunicados, cierre, etc.); solo las subsecciones 07-10 generan un `expected_document` por cada sesión esperada.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del documento esperado. |
| `institution_id` | `uuid` (FK → `institutions.id`) | No | Sede a la que pertenece. |
| `section_id` | `uuid` (FK → `document_sections.id`) | No | Subsección/apartado. |
| `actor` | `actor_tipo` | Sí | Actor (estudiantes/docentes/directivos/familias); `NULL` si es un documento general por sede. |
| `session_normalized` | `linea_cpe` | Sí | Línea normalizada de la sesión; `NULL` si es un documento general por sede. |
| `session_original` | `text` | Sí | Valor original de sesión, si aplica. |
| `session_number` | `integer` | No (default `1`) | Número de sesión dentro del actor/línea (ej. sesión 3 de 12). |
| `document_catalog_id` | `uuid` (FK → `document_catalog.id`) | No | Tipo documental esperado. |
| `required` | `boolean` | No (default `true`) | Si es obligatorio (heredado del catálogo al generarse). |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de generación. |

## 8. `physical_files`

Archivo físico encontrado, según inventario SGD importado.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del archivo. |
| `expected_document_id` | `uuid` (FK → `expected_documents.id`, `ON DELETE SET NULL`) | Sí | Documento esperado al que corresponde este archivo, si se pudo vincular. |
| `institution_id` | `uuid` (FK → `institutions.id`) | No | Sede a la que pertenece el archivo. |
| `file_name` | `text` | No | Nombre del archivo tal como se encontró. |
| `file_extension` | `text` | Sí | Extensión del archivo encontrado. |
| `path_or_link` | `text` | Sí | Ruta o enlace al archivo. |
| `found` | `boolean` | No (default `true`) | Si el archivo fue efectivamente encontrado. |
| `duplicate` | `boolean` | No (default `false`) | Si se detectó como duplicado. |
| `extension_valid` | `extension_valida` | No (default `no_verificable`) | Si la extensión coincide con las permitidas por el catálogo. |
| `naming_valid` | `extension_valida` | No (default `no_verificable`) | Si el nombre coincide con la nomenclatura esperada. |
| `location_valid` | `extension_valida` | No (default `no_verificable`) | Si la ubicación del archivo es la esperada. |
| `file_size_bytes` | `bigint` | Sí | Tamaño del archivo en bytes. |
| `source_import_id` | `uuid` (FK → `imports.id`) | Sí | Importación de inventario que originó este registro. |
| `imported_at` | `timestamptz` | No (default `now()`) | Fecha de importación. |

## 9. `review_events`

Historial **inmutable** de revisiones: solo `INSERT`, nunca `UPDATE`/`DELETE` (ni en RLS ni en ninguna otra parte del esquema). El estado actual de un documento es el último evento por `expected_document_id`.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del evento de revisión. |
| `expected_document_id` | `uuid` (FK → `expected_documents.id`, `ON DELETE CASCADE`) | No | Documento revisado. |
| `reviewer_id` | `uuid` (FK → `profiles.id`) | No | Quién hizo la revisión. |
| `status` | `review_status` | No | Estado asignado en esta revisión. |
| `observation` | `text` | Sí | Observación (obligatoria en la aplicación para ciertos estados; no forzada por constraint SQL). |
| `finding_type` | `finding_type` | Sí | Tipo de hallazgo, si aplica. |
| `requires_remediation` | `boolean` | No (default `false`) | Si requiere subsanación. |
| `remediation_due_date` | `date` | Sí | Fecha límite para subsanar. |
| `priority` | `priority_level` | Sí | Prioridad asignada. |
| `file_reference` | `text` | Sí | Enlace o referencia al archivo revisado. |
| `closing_comment` | `text` | Sí | Comentario de cierre de esta revisión puntual. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha/hora exacta del evento; determina cuál es "el último". |

## 10. `section_comments`

Comentarios generales por sede/apartado, versionados (insert-only, igual que `review_events`).

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del comentario. |
| `institution_id` | `uuid` (FK → `institutions.id`, `ON DELETE CASCADE`) | No | Sede comentada. |
| `section_id` | `uuid` (FK → `document_sections.id`) | No | Apartado comentado. |
| `author_id` | `uuid` (FK → `profiles.id`) | No | Autor del comentario. |
| `comment` | `text` | No | Texto del comentario. |
| `version` | `integer` | No (default `1`) | Número de versión (incremental por sede+apartado); cada envío nuevo crea una fila con versión +1. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha/hora del comentario. |

## 11. `imports`

Control de cargas de archivos (sedes, catálogo, inventario).

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador de la importación. |
| `kind` | `import_kind` | No | Tipo de importación (`sedes`, `catalogo`, `inventario_sgd`). |
| `file_name` | `text` | No | Nombre del archivo subido. |
| `uploaded_by` | `uuid` (FK → `profiles.id`) | No | Quién ejecutó la importación. |
| `status` | `import_status` | No (default `en_progreso`) | Estado del proceso de importación. |
| `summary` | `jsonb` | No (default `{}`) | Resumen: válidos, rechazados, duplicados, nuevos, modificados, desaparecidos. |
| `created_at` | `timestamptz` | No (default `now()`) | Cuándo se inició. |
| `completed_at` | `timestamptz` | Sí | Cuándo terminó (éxito o fallo). |

## 12. `import_errors`

Filas rechazadas o ambiguas de una importación.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del error. |
| `import_id` | `uuid` (FK → `imports.id`, `ON DELETE CASCADE`) | No | Importación a la que pertenece. |
| `row_number` | `integer` | Sí | Número de fila del archivo original con el problema (si aplica). |
| `error_type` | `text` | No | Tipo de error/observación (ej. `dane_duplicado`, `linea_no_reconocida`, `regla_ambigua_pendiente_parametrizacion`). |
| `details` | `jsonb` | No (default `{}`) | Detalle estructurado del error. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha de registro. |

## 13. `export_runs`

Control de exportaciones generadas.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador de la ejecución de exportación. |
| `export_type` | `text` | No | Tipo de exportación (ej. `matriz_estado_actual`, `historial_revisiones`, `calidad_documental_detalle`; el comentario de columna también prevé `resumen_apartado`, `productividad`, `calidad_json` para posibles exportaciones futuras no implementadas aún). |
| `file_name` | `text` | No | Nombre del archivo generado. |
| `generated_by` | `uuid` (FK → `profiles.id`) | No | Quién generó la exportación. |
| `filters` | `jsonb` | No (default `{}`) | Filtros aplicados a la exportación, si los hubo. |
| `row_count` | `integer` | Sí | Cantidad de filas exportadas. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha/hora de la exportación. |

## 14. `audit_log`

Auditoría de correcciones administrativas y acciones sensibles.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` (PK) | No | Identificador del registro de auditoría. |
| `actor_id` | `uuid` (FK → `profiles.id`) | Sí | Quién ejecutó la acción. |
| `action` | `text` | No | Nombre de la acción (ej. `toggle_active`). |
| `entity` | `text` | No | Entidad afectada (ej. `profiles`). |
| `entity_id` | `uuid` | Sí | Identificador del registro afectado. |
| `before` | `jsonb` | Sí | Estado antes del cambio. |
| `after` | `jsonb` | Sí | Estado después del cambio. |
| `created_at` | `timestamptz` | No (default `now()`) | Fecha/hora de la acción. |

---

## Vistas (`0003_views.sql`)

Todas las vistas se crean con `security_invoker = true`: heredan las políticas de RLS de las tablas base según el usuario que las consulta, no según quien creó la vista.

### `vw_estado_actual_documentos`

Estado vigente de cada documento esperado = el último `review_event` por `expected_document_id`, combinado con el archivo físico vinculado (si existe) y los datos de la sede/catálogo. Es la vista base para la bandeja de revisión, el resumen general y dos de las tres exportaciones.

| Columna | Significado |
|---|---|
| `expected_document_id` | Documento esperado (clave de la vista). |
| `coordinador`, `departamento`, `municipio`, `institucion`, `sede`, `dane_sede`, `mentor`, `linea` | Datos de la sede. |
| `apartado` | Nombre de la subsección. |
| `actor`, `sesion` | Actor y sesión del documento (nulos si es general). |
| `evidencia` | Nombre del tipo documental esperado. |
| `obligatorio` | Si es obligatorio. |
| `extension_esperada`, `nomenclatura_esperada` | Reglas del catálogo. |
| `extension_encontrada`, `nombre_encontrado`, `ruta_archivo` | Datos del archivo físico vinculado, si existe. |
| `validacion_extension`, `validacion_nomenclatura` | Resultado de validación del archivo físico. |
| `estado_actual` | Último estado de revisión, o `pendiente_revision` si nunca se ha revisado. |
| `ultima_observacion` | Observación del último evento de revisión. |
| `numero_revisiones` | Cantidad total de eventos de revisión registrados para este documento. |
| `ultimo_revisor` | Nombre de quien hizo la última revisión. |
| `fecha_primera_revision`, `fecha_ultima_revision` | Fechas de la primera y última revisión. |
| `fecha_limite_subsanacion` | Fecha límite de subsanación del último evento. |

### `vw_historial_revisiones`

Una fila por cada acción de revisión registrada (no solo la última) — el historial completo, ordenable cronológicamente. Fuente de la exportación "Historial de revisiones".

| Columna | Significado |
|---|---|
| `review_event_id` | Identificador del evento. |
| `expected_document_id`, `sede`, `dane_sede`, `apartado`, `actor`, `sesion`, `evidencia` | Contexto del documento revisado. |
| `estado`, `observacion`, `tipo_hallazgo`, `requiere_subsanacion`, `fecha_limite_subsanacion`, `prioridad` | Datos propios del evento de revisión. |
| `revisor` | Nombre de quien hizo esta revisión puntual. |
| `fecha_revision` | Fecha/hora del evento. |

### `vw_avance_sede_apartado`

Porcentaje de cumplimiento agregado por sede y apartado. Fuente de la tabla "Cumplimiento por sede y apartado" en Indicadores.

| Columna | Significado |
|---|---|
| `institution_id`, `sede`, `dane_sede`, `linea`, `apartado` | Identifican la combinación sede + apartado. |
| `documentos_esperados` | Total de documentos esperados en esa combinación. |
| `documentos_cumple`, `documentos_no_esta`, `documentos_pendiente_subsanar`, `documentos_pendiente_revision` | Conteo por estado. |
| `porcentaje_cumplimiento` | `documentos_cumple / documentos_esperados * 100`, redondeado a 1 decimal. |

### `vw_productividad_revisores`

Acciones de revisión por revisor y día. Fuente de la tabla "Productividad de revisores" (agregada en la aplicación por revisor, sumando días).

| Columna | Significado |
|---|---|
| `reviewer_id`, `revisor` | Identifican al revisor. |
| `dia` | Día (truncado) de las acciones. |
| `acciones_totales` | Cantidad de eventos de revisión ese día. |
| `documentos_distintos` | Cantidad de documentos distintos tocados ese día. |

### `vw_retrabajo_documental`

Documentos revisados 2 o más veces y su tiempo transcurrido entre la primera y la última revisión. Solo incluye documentos con `count(re.id) > 1` (`having`). Fuente del indicador "Revisados 2+ veces (retrabajo)".

| Columna | Significado |
|---|---|
| `expected_document_id`, `sede`, `mentor`, `coordinador`, `apartado`, `evidencia` | Contexto del documento. |
| `numero_revisiones` | Cantidad de revisiones acumuladas. |
| `fecha_primera_revision`, `fecha_ultima_revision` | Rango temporal de las revisiones. |
| `dias_hasta_ultimo_evento` | Días transcurridos entre la primera y la última revisión. |

### `vw_pendientes_subsanacion`

Documentos cuyo estado vigente es exactamente `pendiente_subsanar`, con indicador de vencimiento. Comentario en la migración: *"Fuente para alertas de vencimiento (Fase 2)"* — es decir, la vista ya existe pero el mecanismo de alertas automáticas (notificaciones, correos, etc.) sobre estos vencimientos no está descrito como implementado en este esquema.

| Columna | Significado |
|---|---|
| `expected_document_id`, `sede`, `coordinador`, `mentor`, `apartado`, `evidencia` | Contexto del documento. |
| `observacion` | Observación del último evento (el que dejó el estado en `pendiente_subsanar`). |
| `fecha_limite_subsanacion` | Fecha límite establecida. |
| `vencido` | `true` si `fecha_limite_subsanacion` ya pasó respecto a `current_date`. |
| `reviewer_id`, `revisor` | Quién dejó el documento en este estado. |
