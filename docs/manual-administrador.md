# Manual de administrador — RevisaSGD

Guía para el rol **administrador**: gestión de cuentas, asignaciones, importación de datos, catálogo documental, exportaciones y auditoría. Para las pantallas de revisión documental compartidas con los demás roles, consulta el [`manual-usuario.md`](./manual-usuario.md).

## 1. Cuentas de usuario: no hay registro público

RevisaSGD **no tiene una pantalla de registro público**. Esto es una decisión deliberada de diseño: al tratarse de una herramienta interna con acceso a información sensible de 306 sedes educativas, todas las cuentas las crea el administrador uno por uno. El proyecto arranca con **8 cuentas iniciales** (el equipo de coordinadores/revisores) más la cuenta de administrador; la pantalla `/admin/usuarios` muestra un contador "X de 8 cuentas creadas" como referencia de ese arranque, aunque nada impide crear más cuentas después si el equipo crece.

### 1.1 Invitar una cuenta nueva

1. Ve a **Administración → Usuarios** (`/admin/usuarios`).
2. En el formulario "Invitar nuevo usuario" completa: nombre completo, correo institucional y rol (administrador, coordinador, revisor o consulta).
3. Al enviar, RevisaSGD llama a la API administrativa de Supabase Auth (`auth.admin.inviteUserByEmail`) para enviar un correo de invitación, y crea en paralelo el registro correspondiente en la tabla `profiles` con ese rol.
4. Si la variable de entorno `SUPABASE_SERVICE_ROLE_KEY` no está configurada en el entorno donde corre RevisaSGD, la invitación falla con un mensaje explícito pidiendo configurarla — esta clave nunca se expone al navegador, solo se usa en código de servidor.
5. Si el usuario se invita correctamente en Auth pero falla la creación del perfil, el mensaje te lo indica por separado, para que sepas que hay que revisar manualmente ese caso (el usuario existe en Auth pero no tiene perfil funcional todavía).

### 1.2 Activar / desactivar cuentas

RevisaSGD **nunca elimina un perfil**. Para retirar el acceso a alguien, se usa el botón "Desactivar" junto a su fila en `/admin/usuarios`, que cambia el campo `active` a `false`. Una cuenta desactivada no puede iniciar sesión (se le redirige al login con el mensaje "Tu cuenta está inactiva. Contacta al administrador."). El botón "Reactivar" revierte esta acción en cualquier momento. Cada cambio de estado queda registrado en `audit_log` con quién lo hizo, cuándo, y el valor anterior/nuevo de `active`.

## 2. Asignación de sedes a revisores

Ruta: `/admin/asignaciones`. Aquí se decide qué sedes puede ver y revisar cada revisor o coordinador — esta asignación es la base del control de acceso por fila (RLS) que aplica en toda la aplicación: un revisor **solo** ve, en su bandeja y en las vistas de indicadores, las sedes que tiene asignadas activamente.

1. Selecciona un revisor o coordinador de la lista de la izquierda.
2. En la tabla de la derecha, busca sedes por nombre y marca "Asignar" o "Quitar" en cada fila.
3. Quitar una asignación **no borra** el historial de revisiones ya registradas por ese revisor en esa sede — solo deja de ser visible para él hacia adelante. El historial es propiedad del sistema, no de la asignación vigente.

> **Nota de configuración actual:** en el menú de navegación, esta sección aparece habilitada tanto para administrador como para coordinador (`roles: ["administrador", "coordinador"]` en `src/lib/nav-config.ts`). Sin embargo, en el código de la página y de la acción de guardado (`src/app/(app)/admin/asignaciones/page.tsx` y `actions.ts`) el control de acceso real (`requireRole("administrador")`) solo permite entrar al **administrador**: un coordinador que haga clic en el enlace del menú será redirigido con un mensaje de "no tienes permiso". Esto está documentado como pendiente de decisión en [`registro-decisiones-pendientes.md`](./registro-decisiones-pendientes.md) — hay que decidir si los coordinadores deben poder gestionar asignaciones de su propio equipo o si el enlace del menú debe ocultárseles.

## 3. Importación de matrices

Ruta: `/admin/importaciones`. Solo administrador. Para el procedimiento paso a paso con nombres exactos de archivo y hoja, ver [`procedimiento-importacion.md`](./procedimiento-importacion.md); aquí se resume el propósito de cada validación.

RevisaSGD nunca modifica los archivos originales que subes: los lee, valida y muestra un resumen antes de que confirmes la importación a la base de datos.

### 3.1 Importar base de sedes (BASE_UNIFICADA)

Sube el archivo `BASE_UNIFICADA_4_COORDINADORES` (.xlsx). El sistema valida, fila por fila:

- **Campos obligatorios faltantes**: código DANE de sede, nombre de sede, nombre de institución, departamento o municipio vacíos → la fila se rechaza y no se importa.
- **Línea no reconocida**: el valor de la columna LINEA no empieza por "L1", "L2" o "L3" → la fila se rechaza.
- **Mentor sin identificación**: si falta el ID del mentor, la fila **se importa igual** pero queda marcada como observación, para seguimiento administrativo posterior (no es bloqueante).
- **DANE duplicado**: si el mismo código DANE de sede aparece más de una vez en el archivo, se reporta como observación sobre todas las filas con ese código (no bloquea la importación individual de cada fila, pero alerta de un problema en la fuente).

Antes de confirmar, el asistente muestra un panel de estadísticas: registros válidos, filas con observaciones, DANE duplicados, y una **reconciliación de sesiones** que compara el total de sesiones esperadas calculado a partir de las sedes válidas contra la cifra de referencia **6.696** (ver [`manual-tecnico.md`](./manual-tecnico.md) para el detalle del cálculo). Revisa este panel con cuidado antes de confirmar: si la reconciliación no coincide con 6.696, algo en la fuente no cuadra con las reglas de sesión esperadas y conviene investigarlo antes de continuar.

Solo al hacer clic en "Confirmar importación" se escriben los datos en la base (`institutions`, por upsert usando código DANE + nombre de sede como clave — ver sección 3.3).

### 3.2 Importar catálogo documental (matrix tipos documentales)

Sube el archivo "matrix tipos documentales" (.xlsx). El sistema separa automáticamente las subsecciones 07 (Estudiantes), 08 (Docentes), 09 (Directivos) y 10 (Familias) — que en el Excel original vienen como una sola celda combinada visualmente — en 4 entradas de catálogo independientes, una por actor.

Reglas de "obligatorio" ambiguas: cuando la columna OBLIGATORIO no trae exactamente "1" ni "0", RevisaSGD **no asume** que es obligatorio ni que no aplica — la marca explícitamente como **"pendiente de parametrización"** (`rule_status = pendiente_parametrizacion`) y la trata como obligatoria por defecto hasta que alguien la revise y decida. El panel de resumen antes de confirmar muestra cuántas entradas quedaron en este estado; conviene revisarlas y, si es necesario, ajustar la regla manualmente después de importar.

El panel de resumen también muestra cuántas entradas no tuvieron una extensión de archivo detectable en el texto de la evidencia (por ejemplo, si el texto no menciona "PDF", "JPG", etc. explícitamente).

### 3.3 Qué pasa al reimportar

Tanto la importación de sedes como la de catálogo pueden repetirse. La importación de sedes hace un **upsert** por la combinación `dane_code + sede_name`: si una sede ya existe con ese DANE y ese nombre, se actualizan sus datos; si no existe, se crea. **Ninguna reimportación borra ni modifica** el historial de revisiones (`review_events`) ni los comentarios de apartado (`section_comments`) — esas tablas son de solo inserción y no tienen ninguna relación de reimportación que las toque. Cada importación queda registrada en la tabla `imports` con su tipo, archivo, quién la subió, estado y un resumen (válidos/rechazados/etc.), y las filas problemáticas se listan en `import_errors` para su revisión posterior en **"Control de errores de importación"**.

### 3.4 Generar documentos esperados

Botón "Generar documentos esperados" al final de la pantalla de importaciones. Combina las sedes ya importadas con el catálogo ya importado y las reglas de sesión por línea (L1/L2/L3) para crear la lista completa de `expected_documents`: qué documento debería existir para cada sede, apartado, actor y número de sesión.

**El orden importa**: este paso solo tiene sentido después de haber importado tanto la base de sedes como el catálogo documental, porque necesita ambos conjuntos de datos para cruzar. Si intentas generarlo sin sedes o sin catálogo, el sistema te lo indica explícitamente sin ejecutar nada.

Ejecutarlo más de una vez sin haber reimportado sedes o catálogo nuevos no duplica documentos (hay una restricción de identidad única en la base de datos por sede + apartado + actor + sesión + tipo documental); si se reimportan sedes o catálogo con cambios, hay que volver a ejecutar este paso para reflejar los cambios en los documentos esperados.

## 4. Exportación de resultados

Ruta: `/admin/exportaciones`. Disponible para **administrador y coordinador**. Genera tres archivos, siempre con datos vigentes al momento de la descarga:

| Archivo | Formato | Fuente | Contenido |
|---|---|---|---|
| `matriz_estado_actual_<fecha>.xlsx` | Excel | vista `vw_estado_actual_documentos` | Una fila por documento esperado con su estado vigente, última observación y último revisor. |
| `historial_revisiones_<fecha>.xlsx` | Excel | vista `vw_historial_revisiones` | Una fila por cada acción de revisión registrada (todo el historial, no solo el estado actual). |
| `calidad_documental_detalle_<fecha>.csv` | CSV | vista `vw_estado_actual_documentos`, con columnas y vocabulario traducidos | Formato de contrato fijo para alimentar la app SGD legacy. Ver [`procedimiento-integracion-sgd.md`](./procedimiento-integracion-sgd.md). |

Los nombres de archivo incluyen la fecha de generación en formato `AAAA-MM-DD` (por ejemplo `matriz_estado_actual_2026-08-10.xlsx`), calculada al momento de la descarga.

Cada descarga exitosa (con al menos un usuario autenticado válido) queda registrada en la tabla `export_runs`: qué tipo de exportación, nombre del archivo, quién la generó y cuántas filas contenía. Si por algún motivo falla el registro de auditoría, la descarga **no se bloquea** — se prioriza que el usuario reciba su archivo, y el registro de auditoría es de mejor esfuerzo.

## 5. Auditoría de acciones (`audit_log`)

Ruta: `/admin/auditoria`, solo administrador. La tabla `audit_log` guarda un rastro de acciones administrativas sensibles — por ejemplo, activar/desactivar una cuenta — con quién la ejecutó, sobre qué entidad, y los valores "antes" y "después" en formato JSON. Solo el administrador puede leerla (política de RLS `audit_log_select_admin`); cualquier usuario autenticado puede insertar en ella (esto es intencional: el propio sistema, actuando en nombre del usuario, es quien escribe estas entradas, no el usuario directamente).

Esta tabla existe para dar trazabilidad a decisiones administrativas que no quedan reflejadas en el historial de revisiones (que ya es inmutable por sí mismo) — por ejemplo, si alguien pregunta "¿quién desactivó esta cuenta y cuándo?", la respuesta está aquí.

## 6. Catálogo documental (edición manual)

Ruta: `/admin/catalogo`, solo administrador. Permite consultar y ajustar manualmente entradas del catálogo documental generado por la importación — por ejemplo, para resolver reglas marcadas como "pendiente de parametrización" una vez que se confirme con el equipo del proyecto si un documento es obligatorio o no para una línea/actor específico.

## 7. Resumen de responsabilidades del administrador

- Crear y desactivar cuentas (no hay registro público).
- Asignar sedes a revisores y coordinadores.
- Importar la base de sedes y el catálogo documental, revisando los paneles de validación antes de confirmar.
- Generar (y regenerar cuando corresponda) los documentos esperados.
- Resolver reglas "pendientes de parametrización" en el catálogo.
- Generar exportaciones para reportes o para alimentar el SGD legacy.
- Revisar la auditoría cuando se necesite reconstruir una decisión administrativa.
