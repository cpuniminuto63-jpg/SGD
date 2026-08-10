# Manual de usuario — RevisaSGD

Guía para los roles **revisor**, **coordinador** y **consulta**. Si eres administrador, consulta también el [`manual-administrador.md`](./manual-administrador.md).

## 1. Qué es RevisaSGD

RevisaSGD es la herramienta interna con la que UNIMINUTO y Computadores para Educar hacen seguimiento a la revisión documental de las 306 sedes educativas del proyecto CPE (líneas L1, L2 y L3). Permite registrar, sede por sede y documento por documento, si la evidencia que debía cargarse al SGD (Sistema de Gestión Documental) efectivamente está, cumple con el formato esperado y con qué observaciones.

## 2. Iniciar sesión

1. Abre la URL de RevisaSGD en tu navegador. Si no tienes una sesión activa, se te redirige automáticamente a `/login`.
2. Ingresa tu **correo institucional** y tu **contraseña**.
3. Si tus credenciales son incorrectas, verás el mensaje "Credenciales inválidas. Verifica tu correo y contraseña."
4. Si tu cuenta fue desactivada por el administrador, al iniciar sesión se te devuelve a la pantalla de login con el mensaje "Tu cuenta está inactiva. Contacta al administrador."
5. Si olvidaste tu contraseña, usa el enlace **"Recupérala aquí"** en la pantalla de login, que te lleva a `/recuperar-acceso`. Allí ingresas tu correo institucional y el sistema te envía un enlace seguro para restablecerla.

**No existe registro público.** Las cuentas las crea exclusivamente el administrador (ver manual de administrador). Si necesitas acceso y no tienes cuenta, solicítala a quien administra RevisaSGD en tu equipo.

## 3. Navegación general

El menú lateral izquierdo muestra únicamente las secciones habilitadas para tu rol:

| Sección | Revisor | Coordinador | Consulta |
|---|---|---|---|
| Resumen general | Sí | Sí | Sí |
| Mi bandeja de revisión | Sí | Sí | No |
| Explorador de sedes | Sí | Sí | Sí |
| Indicadores | Sí | Sí | Sí |
| Asignación de sedes (Administración) | No | Sí | No |
| Exportación de resultados (Administración) | No | Sí | No |

El rol **consulta** tiene acceso de solo lectura a Resumen general, Explorador de sedes e Indicadores; no puede revisar documentos, comentar apartados ni exportar.

## 4. "Mi bandeja de revisión"

Ruta: `/mi-bandeja`. Disponible para revisor, coordinador y administrador.

Esta pantalla lista, uno por fila, cada **documento esperado** (la combinación sede + apartado + actor + sesión + tipo documental) junto con su estado vigente. Un revisor solo ve los documentos de las **sedes que tiene asignadas**; un coordinador ve los de su equipo; el administrador ve todo. Esto lo aplica automáticamente la base de datos (seguridad a nivel de fila), no es un filtro que puedas desactivar desde la interfaz.

### Filtros disponibles

- **Sede**: búsqueda de texto libre por nombre de sede (coincidencia parcial, no distingue mayúsculas/minúsculas).
- **Estado**: desplegable con los 6 estados de revisión (ver sección 5) o "Todos".

Al enviar el formulario de filtros la URL queda con los parámetros `?q=...&estado=...`, así que puedes compartir o guardar el enlace de una vista filtrada. El listado se pagina de 30 en 30 filas, con enlaces "← Anterior" / "Siguiente →".

Cada fila muestra: sede (y su código DANE), apartado, actor/sesión (o "General" cuando el documento no está ligado a un actor específico — ver sección 6), evidencia, estado actual (con su color) y número de revisiones acumuladas. El botón **"Revisar"** abre la ficha del documento.

Si todavía no se ha importado nada, la bandeja muestra un mensaje guiando a Administración → Importación de matrices.

## 5. Ficha de un documento y formulario de revisión

Ruta: `/mi-bandeja/[id]`.

La parte superior de la ficha muestra el contexto completo del documento: evidencia, sede, DANE, apartado, actor/sesión, municipio, departamento, coordinador, mentor, si es obligatorio, número de revisiones previas, fecha y autor de la última revisión, y (si existe) un enlace directo al archivo encontrado ("Abrir archivo →").

### Los 6 estados de revisión

RevisaSGD define un único vocabulario de estados (`ReviewStatus`), reutilizado en toda la aplicación:

| Estado | Etiqueta en pantalla | ¿Requiere observación? |
|---|---|---|
| `pendiente_revision` | Pendiente de revisión | No |
| `no_esta` | No está el documento | **Sí** |
| `pendiente_subsanar` | Pendiente por subsanar | **Sí** |
| `cumple` | Cumple | No |
| `no_aplica` | No aplica | **Sí** |
| `reemplazado` | Reemplazado | **Sí** |

La regla de "observación obligatoria" no es solo una sugerencia de buena práctica: el formulario la valida antes de guardar. Si eliges un estado que la requiere y dejas la observación vacía, RevisaSGD rechaza el envío y te devuelve a la ficha con el mensaje `El estado "<nombre del estado>" requiere una observación.`, sin registrar nada. La razón de fondo: los estados que "no cumplen" tal cual (falta el documento, hay que subsanarlo, no aplica, o fue reemplazado) necesitan justificación para que cualquiera que revise el historial después entienda por qué se marcó así — a diferencia de "Cumple" o "Pendiente de revisión", que son autoexplicativos.

### Campos del formulario "Nueva revisión"

- **Estado** (obligatorio): uno de los 6 anteriores.
- **Prioridad**: baja / media / alta / urgente, opcional — útil para priorizar remediaciones.
- **Observación**: obligatoria u opcional según el estado elegido (ver arriba).
- **Tipo de hallazgo**: documento ausente, nomenclatura incorrecta, extensión incorrecta, ubicación incorrecta, duplicado, calidad de contenido, u otro. Opcional, sirve para clasificar el problema encontrado.
- **Fecha límite de subsanación**: fecha opcional para marcar cuándo debería quedar resuelto un pendiente.
- **Requiere subsanación**: casilla opcional.
- **Enlace o referencia del archivo**: texto libre, opcional.
- **Comentario de cierre**: texto libre, opcional, para dejar una nota final sobre esa revisión puntual.

### "Guardar" vs "Guardar y siguiente"

El formulario tiene dos botones de envío:

- **Guardar**: registra la revisión y te devuelve a la pantalla desde la que llegaste (la bandeja, con tus filtros intactos).
- **Guardar y siguiente**: registra la revisión y te lleva directamente al **siguiente documento pendiente de revisión** disponible (el primero en orden alfabético de sede distinto al actual con estado "Pendiente de revisión"). Si no hay ningún otro pendiente, te devuelve igualmente a la bandeja. Este botón está pensado para revisar en serie sin tener que volver manualmente a la lista cada vez.

Ambos botones ejecutan la misma validación de observación obligatoria antes de guardar.

## 6. Historial inmutable: por qué nunca se borra ni se edita una revisión

Cada vez que guardas una revisión, RevisaSGD **inserta un nuevo registro** (`review_event`); nunca modifica ni elimina uno anterior. Esto es una decisión de diseño reforzada incluso a nivel de base de datos: no existe ninguna operación de "editar" o "borrar" una revisión ya guardada, ni para revisores ni para administradores.

**Ejemplo concreto** (tomado del criterio original del proyecto): un documento pasa por tres revisiones sucesivas:

1. Un revisor lo marca como **"No está el documento"** (con su observación).
2. Semanas después, tras subsanación, otro revisor (o el mismo) lo marca como **"Pendiente por subsanar"**.
3. Finalmente, al confirmar que ya se cargó correctamente, se marca como **"Cumple"**.

Los **tres** eventos quedan guardados para siempre, con su fecha, su autor y su observación. La ficha del documento muestra el **estado actual** como "Cumple" (el más reciente), pero en la sección **"Historial"**, debajo del formulario, puedes ver la línea de tiempo completa con los tres pasos, en orden del más reciente al más antiguo, cada uno con fecha, hora, revisor y observación.

¿Para qué sirve esto? Para que nadie pueda "limpiar" un historial de incumplimientos borrando evidencia de que un documento estuvo mal en algún momento, y para que cualquier auditoría posterior pueda reconstruir exactamente qué pasó y cuándo.

## 7. Comentarios generales por sede/apartado

Además de la revisión documento por documento, puedes dejar un **comentario general** sobre un apartado completo de una sede (por ejemplo, una observación sobre todo el apartado "07 Estudiantes" de una sede específica, no sobre una evidencia puntual).

1. Ve a **Explorador de sedes** → elige una sede → verás la lista de "Apartados".
2. Junto a cada apartado, si tu rol lo permite (administrador, coordinador o revisor), hay un enlace **"Ver comentarios →"**. El rol consulta ve la etiqueta "Sin acceso" en su lugar.
3. En la pantalla de comentarios del apartado verás el historial de comentarios anteriores (versión, fecha, autor) y un formulario para agregar uno nuevo.
4. Al enviar el formulario se crea una **nueva versión** del comentario (`version` incrementa en 1). Igual que con las revisiones, **los comentarios no se pueden editar ni eliminar**: cada envío agrega una entrada nueva y conserva todas las anteriores con su autoría.

## 8. Explorador de sedes

Ruta: `/sedes`. Disponible para todos los roles, incluido consulta.

Lista las 306 sedes con: nombre de sede, código DANE, municipio/departamento, línea CPE (L1/L2/L3), coordinador y mentor asignados. Puedes buscar por nombre de sede. Al hacer clic en "Ver sede" entras al detalle de esa sede, con sus datos generales y la lista de apartados documentales (para acceder a los comentarios de cada uno, ver sección 7).

## 9. Indicadores

Ruta: `/indicadores`. Disponible para todos los roles, incluido consulta (con el mismo filtrado de visibilidad por sede que aplica en toda la aplicación).

El panel muestra, en este orden:

1. **Resumen**: documentos esperados totales, documentos faltantes ("No está el documento"), documentos únicos que ya tuvieron al menos una revisión, y acciones totales de revisión (un mismo documento puede acumular varias acciones por subsanaciones sucesivas — por eso estos dos últimos números no coinciden). También se muestra cuántos documentos llevan 2 o más revisiones ("retrabajo") con su tasa porcentual, y cuántos pendientes por subsanar están **vencidos** (fecha límite ya pasada). Debajo, una fila de tarjetas con la distribución de documentos por cada uno de los 6 estados y su porcentaje sobre el total esperado.
2. **Cumplimiento por sede y apartado**: tabla con las 50 combinaciones sede/apartado con **menor** porcentaje de cumplimiento, cada una con una barra de progreso coloreada (verde ≥80%, ámbar ≥50%, rojo por debajo).
3. **Productividad de revisores**: acciones totales y documentos distintos revisados por cada revisor, ordenado de mayor a menor actividad.
4. **Pendientes por subsanar**: hasta 100 documentos en estado "Pendiente por subsanar", con los vencidos resaltados y listados primero.

Si todavía no se ha importado ninguna sede o catálogo, el panel muestra un aviso indicando que hay que importar datos primero (ver manual de administrador).

## 10. Preguntas frecuentes

**¿Puedo corregir una revisión que registré por error?** No editando la existente: registra una nueva revisión con el estado correcto y, si aplica, una observación aclarando el error. El historial completo queda visible para quien lo consulte después.

**¿Por qué no veo todas las sedes en mi bandeja?** Si eres revisor, solo ves las sedes que el administrador o tu coordinador te asignaron explícitamente (ver "Asignación de sedes" en el manual de administrador). Si crees que falta una sede, contacta a tu coordinador o al administrador.

**¿Qué significa "Actor / Sesión: General"?** Algunos apartados documentales (comunicados, diagnósticos, cierre, etc.) no están ligados a un actor (estudiantes/docentes/directivos/familias) ni a una sesión puntual: son un único documento por sede. Esos aparecen marcados como "General" en vez de mostrar un actor y número de sesión.
