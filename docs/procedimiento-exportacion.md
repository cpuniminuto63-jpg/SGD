# Procedimiento de exportación de resultados

Ruta: `/admin/exportaciones`, disponible para los roles **administrador** y **coordinador** (`requireRole("administrador", "coordinador")` en la página, y `requireExportRole("administrador", "coordinador")` en cada Route Handler que genera el archivo — esta segunda comprobación es la que realmente protege la descarga, porque los Route Handlers no pasan por el layout de `(app)/`).

## 1. Los tres archivos

| Archivo | Ruta que lo genera | Formato | Vista fuente |
|---|---|---|---|
| Matriz de estado actual | `GET /api/export/estado-actual` | `.xlsx` | `vw_estado_actual_documentos` |
| Historial de revisiones | `GET /api/export/historial` | `.xlsx` | `vw_historial_revisiones` |
| Calidad documental detalle | `GET /api/export/calidad-sgd` | `.csv` | `vw_estado_actual_documentos` (con columnas y vocabulario traducidos al contrato SGD) |

Cada tarjeta en `/admin/exportaciones` tiene un botón "Descargar" que apunta directamente a la ruta de la API; el navegador dispara la descarga del archivo generado en el momento.

## 2. Matriz de estado actual (`matriz_estado_actual_<fecha>.xlsx`)

Genera una hoja "Estado actual" a partir de `vw_estado_actual_documentos`, con **una fila por documento esperado**: coordinador, departamento, municipio, institución, sede, DANE, mentor, línea, apartado, actor, sesión, evidencia, si es obligatorio, estado actual, última observación, número de revisiones, último revisor, fecha de primera/última revisión, fecha límite de subsanación y ruta del archivo. Las columnas usan encabezados en español, en el orden fijo definido en `src/app/api/export/estado-actual/route.ts`.

## 3. Historial de revisiones (`historial_revisiones_<fecha>.xlsx`)

Genera una hoja "Historial de revisiones" a partir de `vw_historial_revisiones`, con **una fila por cada acción de revisión registrada** (no solo el estado vigente): sede, DANE, apartado, actor, sesión, evidencia, estado, observación, tipo de hallazgo, si requiere subsanación, fecha límite, prioridad, revisor y fecha de la revisión. A diferencia de la matriz de estado actual, este archivo puede tener varias filas para el mismo documento esperado si tuvo varias revisiones — es la fuente para reconstruir línea de tiempo completa fuera de la aplicación.

## 4. Calidad documental detalle (`calidad_documental_detalle_<fecha>.csv`)

Formato **de contrato fijo**, pensado exclusivamente para alimentar la app SGD legacy (no para lectura humana general). Ver el detalle completo de columnas y del mapeo de estados en [`procedimiento-integracion-sgd.md`](./procedimiento-integracion-sgd.md). El archivo se genera con BOM UTF-8 al inicio para que Excel abra correctamente tildes y la ñ.

## 5. Quién puede generar cada exportación

Tanto la página (`/admin/exportaciones`) como cada Route Handler de exportación exigen rol `administrador` o `coordinador`. Un usuario sin sesión válida recibe `401 No autenticado.`; un usuario autenticado pero sin el rol correcto (o con la cuenta desactivada) recibe `403`. El rol `revisor` y `consulta` no tienen acceso a esta pantalla ni pueden invocar las rutas de exportación directamente (la comprobación de rol se hace en el servidor, no depende de que el enlace esté oculto en el menú).

## 6. Convención de nombre de archivo

Todos los archivos incluyen la fecha de generación en formato `AAAA-MM-DD` al final del nombre (función `todayStamp()` en `src/lib/export/record-export-run.ts`, basada en `new Date().toISOString().slice(0, 10)` — la fecha del servidor en el momento de la descarga, en UTC). Ejemplos: `matriz_estado_actual_2026-08-10.xlsx`, `calidad_documental_detalle_2026-08-10.csv`. Esto permite conservar copias históricas de cada exportación sin que se sobrescriban entre sí si se descargan varias veces en días distintos.

## 7. Qué registra `export_runs`

Cada exportación exitosa, con un usuario autenticado válido, inserta una fila en `export_runs` con: `export_type` (identificador corto del tipo de exportación, ej. `matriz_estado_actual`), `file_name` (el nombre exacto generado), `generated_by` (el `id` del usuario que la generó), `filters` (objeto JSON de filtros aplicados — actualmente vacío `{}` en las tres exportaciones, ya que ninguna aplica filtros adicionales sobre la vista fuente) y `row_count` (cantidad de filas exportadas).

Este registro es de **mejor esfuerzo**: si falla la escritura en `export_runs` por cualquier motivo, la descarga del archivo **no se bloquea** — el usuario recibe igualmente su archivo, y solo se pierde la trazabilidad de esa descarga puntual. Esta decisión prioriza que el flujo de trabajo de reportes nunca se vea interrumpido por un problema de auditoría.

Quién puede **leer** `export_runs` (para ver el historial de exportaciones generadas) está limitado por RLS a administrador, coordinador, o el propio usuario que generó cada exportación (`export_runs_select`); actualmente no hay una pantalla dedicada en la interfaz para listar este historial, más allá de lo que pueda consultarse directamente en la base de datos.
