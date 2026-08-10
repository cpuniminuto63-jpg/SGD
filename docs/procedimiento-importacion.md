# Procedimiento de importación de datos

Guía operativa paso a paso para cargar la base de sedes y el catálogo documental en RevisaSGD. Solo el rol **administrador** tiene acceso a esta pantalla (`/admin/importaciones`).

## 1. Archivos de origen

RevisaSGD importa dos archivos Excel distintos, entregados por el equipo del proyecto:

1. **`BASE_UNIFICADA_4_COORDINADORES`** (.xlsx): la base de las 306 sedes educativas, con coordinador, línea CPE, mentor, ubicación, etc.
2. **"matrix tipos documentales"** (.xlsx, en el repositorio se referencia como `matrix tipos documentales_vf4.xlsx`): la matriz de tipos documentales/evidencias esperadas por subsección.

Estos archivos deben obtenerse directamente de quien administra el proyecto CPE (UNIMINUTO/Computadores para Educar); no hay una fuente automatizada dentro de RevisaSGD para generarlos ni sincronizarlos — la importación siempre parte de un archivo Excel subido manualmente.

## 2. Nombres exactos de hoja esperados

Cada asistente de importación exige un nombre de hoja **literal** dentro del archivo. Si el archivo no contiene una hoja con ese nombre exacto, la lectura falla.

| Archivo | Componente que lo lee | Nombre de hoja exacto usado en el código |
|---|---|---|
| BASE_UNIFICADA_4_COORDINADORES | `src/components/import/institutions-import-wizard.tsx` | `"BASE_UNIFICADA"` |
| matrix tipos documentales | `src/components/import/catalog-import-wizard.tsx` | `"ESTRUCTURA_DETALLE "` (**con un espacio al final** — es el literal exacto pasado a `readWorkbookRows(file, "ESTRUCTURA_DETALLE ")` en el código fuente actual) |

> Si al renombrar o regenerar el archivo de catálogo se elimina ese espacio final en el nombre de la hoja, la importación fallará con un error de lectura. Verifica el nombre de la hoja con cuidado (incluyendo espacios) antes de reportar un error como "bug" — puede ser simplemente un desajuste de nombre de hoja entre el archivo nuevo y lo que el código espera.

Ambos parsers asumen que los datos empiezan **después de dos filas de título/encabezado** (título + encabezado real de columnas): el código descarta las dos primeras filas (`rows.slice(2)`) antes de pasarlas al parser correspondiente.

## 3. Orden de importación (importa)

El orden **sí importa**, porque el paso final (generar documentos esperados) necesita ambos conjuntos de datos:

1. Importa primero la **base de sedes** (BASE_UNIFICADA).
2. Importa después el **catálogo documental** (matrix tipos documentales).
3. Solo entonces ejecuta **"Generar documentos esperados"**.

Si intentas generar documentos esperados sin haber importado sedes o sin haber importado catálogo, la acción se detiene con un mensaje explícito indicando cuál de los dos falta, sin escribir nada.

## 4. Paso a paso: importar la base de sedes

1. En `/admin/importaciones`, en el bloque "Importar base de sedes", selecciona el archivo `.xlsx`.
2. El sistema lee la hoja `BASE_UNIFICADA` y muestra un panel de validación **antes de escribir nada en la base de datos**:
   - **Registros válidos**: filas que pasaron todas las validaciones obligatorias.
   - **Filas con observaciones**: filas rechazadas o marcadas (ver detalle abajo).
   - **DANE duplicados**: cuántos códigos DANE aparecen más de una vez en el archivo.
   - **Reconciliación de sesiones**: total de sesiones calculado a partir de las sedes válidas, comparado contra la cifra de referencia **6.696**, con indicador visual verde (coincide) o ámbar (no coincide).
3. Si hay observaciones, se despliega el detalle por tipo: campo obligatorio faltante, línea no reconocida, mentor sin identificación, DANE duplicado.
4. **Revisa el panel completo antes de confirmar.** Si la reconciliación no da 6.696, hay una discrepancia entre el archivo fuente y las reglas de sesión esperadas — vale la pena investigarla antes de seguir, aunque el botón de confirmación no está bloqueado por ese motivo.
5. Haz clic en "Confirmar importación de N sedes". Esto:
   - Crea un registro en `imports` (`kind = 'sedes'`) con tu usuario como responsable.
   - Hace un **upsert** en `institutions` usando `(dane_code, sede_name)` como clave de conflicto: si la combinación ya existe, actualiza los demás campos; si no, inserta una fila nueva.
   - Inserta en `import_errors` el detalle de cada fila con observaciones, vinculado al `import_id`.
   - Marca el `import` como `completado`, `completado_con_errores` o `fallido` según el resultado.

## 5. Paso a paso: importar el catálogo documental

1. En el bloque "Importar catálogo documental", selecciona el archivo `.xlsx`.
2. El sistema lee la hoja `ESTRUCTURA_DETALLE ` (con el espacio final) y muestra:
   - **Entradas**: total de filas de catálogo generadas (una fila del Excel puede producir hasta 4 entradas si es una fila de la sección de sesiones por actor — ver más abajo).
   - **Subsecciones**: cuántas subsecciones distintas se detectaron.
   - **Pendientes de parametrización**: cuántas entradas quedaron con una regla de "obligatorio" ambigua (ni `"1"` ni `"0"` en la columna correspondiente).
   - **Sin extensión detectada**: cuántas entradas no tuvieron una extensión de archivo reconocible en el texto de la evidencia.
3. Las subsecciones 07 (Estudiantes), 08 (Docentes), 09 (Directivos) y 10 (Familias) — que en el Excel llegan como una sola celda visualmente combinada `"07_ESTUDIANTES\n08_DOCENTES\n09_DIRECTIVOS\n10_FAMILIAS"` — se separan automáticamente en 4 entradas de catálogo independientes, una por actor.
4. Haz clic en "Confirmar importación de N entradas". Esto:
   - Crea un registro en `imports` (`kind = 'catalogo'`).
   - Crea en `document_sections` las subsecciones que aún no existan (usando el código detectado y, si aplica, el actor correspondiente).
   - Inserta las entradas en `document_catalog`, vinculadas a su subsección.
   - Inserta en `import_errors` (con `error_type = 'regla_ambigua_pendiente_parametrizacion'`) las filas cuya obligatoriedad quedó ambigua.

## 6. Qué pasa al reimportar (comportamiento de upsert)

- **Sedes**: se actualiza por `(dane_code, sede_name)`. Reimportar el mismo archivo (o una versión corregida) actualiza los datos de las sedes existentes sin duplicarlas.
- **Catálogo**: cada importación de catálogo **inserta** nuevas entradas en `document_catalog` (no hace upsert por nombre de evidencia); si reimportas un catálogo con cambios, revisa manualmente si hace falta desactivar entradas antiguas (`valid_to`) para evitar duplicados de significado similar. Las subsecciones (`document_sections`) sí se reutilizan si ya existen por código.
- **En ningún caso una reimportación toca `review_events` ni `section_comments`.** Estas dos tablas son de solo inserción (no tienen relación de actualización con ninguna importación) — el historial de revisiones y los comentarios de apartado sobreviven intactos a cualquier reimportación de sedes o catálogo, tal como está reforzado por la ausencia de políticas `UPDATE`/`DELETE` sobre ellas en `0002_rls.sql`.

## 7. Generar documentos esperados

Una vez importadas sedes y catálogo (en ese orden), ejecuta el botón **"Generar documentos esperados"**:

- Lee todas las sedes activas y todo el catálogo vigente (`valid_to is null`).
- Resuelve el actor de cada entrada de catálogo a partir de la subsección a la que pertenece.
- Genera un `expected_document` por cada combinación sede + subsección + actor + número de sesión + tipo documental, según las reglas de sesión de la línea de cada sede (`SESSION_COUNTS`, ver `manual-tecnico.md`).
- Inserta los resultados en lotes de 1.000 filas.

Volver a ejecutar este paso sin haber reimportado sedes o catálogo nuevos **no duplica documentos** (hay una restricción de identidad única en la base de datos). Si reimportaste sedes o catálogo con cambios reales, vuelve a ejecutar este paso para que los nuevos documentos esperados se generen — los ya existentes no se tocan ni se eliminan automáticamente si una sede o entrada de catálogo deja de aplicar; ese escenario requiere revisión manual.

## 8. Revisar errores de importación

Ruta: **Administración → Control de errores de importación** (`/admin/errores-importacion`), solo administrador. Lista el detalle de `import_errors` por importación, para hacer seguimiento a las filas con observaciones (mentores sin identificar, DANE duplicados, reglas ambiguas) después de haber confirmado la importación.
