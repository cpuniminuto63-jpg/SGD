# Manual técnico — RevisaSGD

Documentación para desarrolladores que trabajen sobre RevisaSGD: arquitectura, patrones de código, seguridad, pipeline de importación, y cómo correr el proyecto localmente.

## 1. Arquitectura

RevisaSGD es una aplicación **Next.js 15/16 (App Router) con TypeScript**, desplegada en **Vercel**, que usa **Supabase** (Postgres + Auth) como backend de datos y autenticación. No hay un backend propio separado: toda la lógica de servidor vive en Server Components, Server Actions y Route Handlers de Next.js, y la autorización de datos se refuerza a nivel de base de datos con **Row Level Security (RLS)**.

Ver [`diagrama-arquitectura.md`](./diagrama-arquitectura.md) para el diagrama Mermaid completo, incluyendo el flujo de importación/exportación y dónde se ubicaría el pipeline de despliegue.

Componentes principales:

- **Next.js App Router** (`src/app/`): páginas server-first, Server Actions para mutaciones (formularios que llaman funciones `"use server"` directamente, sin API REST intermedia salvo para exportaciones), y Route Handlers (`src/app/api/`) para las descargas de archivos.
- **Supabase Postgres**: 14 tablas base + 6 vistas (ver [`diccionario-de-datos.md`](./diccionario-de-datos.md)), con RLS habilitado en todas las tablas.
- **Supabase Auth**: autenticación por correo/contraseña. No hay registro público — las cuentas se crean desde el panel de administración usando la API administrativa de Supabase (`auth.admin.inviteUserByEmail`).
- **Vercel**: hosting de la app Next.js (asumido por el stack usado — no hay configuración de otro proveedor en el repositorio).

RevisaSGD **no tiene** (a la fecha de esta documentación) integración con Microsoft Graph/OneDrive ni ningún mecanismo de sincronización automática de archivos: la vinculación entre un documento esperado y un archivo físico (`physical_files`) depende de una importación manual de inventario (`import_kind = 'inventario_sgd'`), y no hay evidencia en el código de un cliente de Graph API, webhook o job de sincronización. Si el proyecto contempla esa integración como una fase futura (Fase 3 según el brief original), **todavía no está implementada**.

## 2. Estructura de directorios (resumen)

```
src/
  app/
    (app)/                 # Rutas protegidas por sesión, con sidebar + topbar (layout.tsx)
      admin/                # Usuarios, asignaciones, catálogo, importaciones, exportaciones, auditoría
      indicadores/
      mi-bandeja/           # Bandeja de revisión + ficha de documento ([id])
      sedes/                # Explorador de sedes + comentarios por apartado
    api/export/             # Route Handlers que generan los 3 archivos de exportación
    login/                  # Página pública de login + Server Action signIn
    recuperar-acceso/       # Recuperación de contraseña
  components/
    import/                 # Asistentes de importación (client components)
    app-sidebar.tsx, app-topbar.tsx, status-badge.tsx
  lib/
    auth/                   # getCurrentProfile, requireRole
    export/                 # sgd-status-adapter, record-export-run, require-export-role, to-csv
    import/                 # parse-institutions, parse-catalog, session-rules, generate-expected-documents, read-workbook
    supabase/                # client.ts, server.ts, middleware.ts, admin.ts, database.types.ts
    review-status.ts, nav-config.ts
  proxy.ts                  # Middleware de sesión (ver sección 4)
supabase/migrations/         # 0001_schema.sql, 0002_rls.sql, 0003_views.sql
scripts/smoke-test-import.ts # Verificación manual del pipeline de importación contra archivos reales
```

## 3. El patrón de tres clientes Supabase

RevisaSGD usa **tres** formas distintas de crear un cliente de Supabase, cada una con un propósito y un contexto de ejecución diferente:

1. **`src/lib/supabase/client.ts`** (`createClient`, navegador): usa `createBrowserClient` de `@supabase/ssr` con la URL y la **anon key** públicas. Se usa en componentes cliente (`"use client"`) que necesitan hablar con Supabase directamente desde el navegador — su acceso a datos está acotado enteramente por las políticas de RLS de la anon key autenticada.
2. **`src/lib/supabase/server.ts`** (`createClient`, servidor): usa `createServerClient` de `@supabase/ssr`, también con la anon key, pero leyendo/escribiendo las cookies de sesión a través de `next/headers`. Se usa en Server Components, Server Actions y Route Handlers — sigue estando sujeto a RLS según el usuario autenticado en esa sesión (no es un cliente con privilegios elevados).
3. **`src/lib/supabase/admin.ts`** (`createAdminClient`): usa la **service role key** (`SUPABASE_SERVICE_ROLE_KEY`), que **nunca** debe llegar al navegador. Se usa exclusivamente en código de servidor (`"use server"`) que necesita operaciones que la anon key no puede hacer, como invitar usuarios vía `auth.admin.inviteUserByEmail`. Lanza un error explícito si la variable de entorno no está configurada.

Además, `src/proxy.ts` (ver sección 4) crea su propio cliente Supabase inline dentro de `src/lib/supabase/middleware.ts::updateSession`, porque el middleware corre en el Edge Runtime y necesita leer/escribir cookies directamente sobre el objeto `NextRequest`/`NextResponse`, un contexto distinto al de `next/headers` que usan Server Components y Actions.

**Por qué tres (realmente cuatro) clientes y no uno solo:** cada contexto de ejecución de Next.js (navegador, Server Component/Action, Edge Middleware) maneja las cookies de sesión de forma distinta, y `@supabase/ssr` requiere pasarle explícitamente cómo leer/escribir esas cookies en cada uno. Mezclar el cliente de servidor con el de navegador rompería el refresco de sesión; usar el cliente con service role key fuera de código de servidor filtraría credenciales con privilegios de administrador de Auth y evadiría RLS.

## 4. `src/proxy.ts`: el middleware de sesión

En Next.js 16, el archivo de middleware para interceptar peticiones se llama `proxy.ts` (reemplaza a `middleware.ts` de versiones anteriores). `src/proxy.ts` delega en `updateSession()` (`src/lib/supabase/middleware.ts`), que:

- Refresca la sesión de Supabase en cada petición (necesario porque los tokens expiran).
- Redirige a `/login` si no hay usuario autenticado y la ruta no es pública (`/login`, `/recuperar-acceso`, `/auth/callback`).
- Redirige a `/` si un usuario ya autenticado intenta visitar `/login`.

El `matcher` excluye assets estáticos (`_next/static`, `_next/image`, `favicon.ico`, `logos/`, imágenes) para no ejecutar el middleware innecesariamente en cada request de recursos.

## 5. Autorización en capas: RLS + `requireRole`

RevisaSGD refuerza la autorización en **dos capas independientes**: RLS en la base de datos (la que realmente importa para seguridad) y comprobaciones de rol en la capa de aplicación (`requireRole`, principalmente para UX — redirigir con un mensaje claro en vez de mostrar un error de base de datos crudo).

### 5.1 Roles

`user_role` (enum en Postgres): `administrador`, `coordinador`, `revisor`, `consulta`.

### 5.2 Funciones helper de RLS (`0002_rls.sql`)

- `current_role_name()`, `is_admin()`, `is_coordinador()`, `is_revisor()`: funciones `security definer` que leen el rol del usuario autenticado (`auth.uid()`) desde `profiles`.
- `visible_institution_ids()`: el corazón del control de acceso por sede. Devuelve el conjunto de `institution.id` visibles para el usuario actual:
  - Administrador o rol `consulta`: **todas** las sedes.
  - Coordinador: las sedes donde `institutions.coordinator_profile_id = auth.uid()`.
  - Revisor: las sedes con una fila activa en `reviewer_assignments` para ese usuario.

Todas las políticas `select` de `institutions`, `expected_documents`, `physical_files`, `review_events` y `section_comments` filtran por `institution_id in (select visible_institution_ids())` (directa o transitivamente). Esto significa que el filtrado por sede **no es un filtro de la interfaz** — ocurre en la base de datos, así que ni siquiera una consulta manual mal construida en el frontend podría filtrar de más datos de los que el rol permite ver.

### 5.3 Inmutabilidad de `review_events`: forzada a nivel de base de datos

Esta es la garantía más importante del sistema y está implementada de la forma más fuerte posible: **no existe ninguna política de `UPDATE` ni `DELETE` para `review_events`**, para ningún rol, en ningún archivo de migración. Solo hay `review_events_select` y `review_events_insert`. Postgres deniega por defecto cualquier operación sin política que la autorice explícitamente, así que un `UPDATE` o `DELETE` sobre `review_events` falla siempre, sin importar el rol ni los privilegios de la aplicación — la única forma de "corregir" un error es insertar un nuevo evento. Esto no es una regla de negocio aplicada solo en el código de la aplicación (que podría eludirse con acceso directo a la base de datos): es una restricción estructural de la base de datos misma. Lo mismo aplica, por el mismo mecanismo, a `section_comments` (comentarios versionados, insert-only) y a `profiles` (nunca se borra un perfil, solo se desactiva vía `UPDATE` administrativo — tampoco hay política de `DELETE`).

La política de inserción de `review_events` (`review_events_insert`) exige además que `reviewer_id = auth.uid()` (nadie puede insertar una revisión "a nombre de otro") y que, si el usuario es revisor (no admin), el `expected_document_id` pertenezca a una sede con una asignación activa (`reviewer_assignments`) para ese usuario.

### 5.4 `requireRole` (capa de aplicación)

`src/lib/auth/require-role.ts` es una utilidad de conveniencia para Server Components/Actions: obtiene el perfil actual y, si su rol no está en la lista permitida, redirige a `/` con un mensaje de error legible. **No reemplaza a RLS** — es una capa de UX que evita mostrarle a un usuario sin permiso una pantalla que de todos modos fallaría al leer datos por RLS, dándole en cambio un mensaje claro. La versión para Route Handlers (`src/lib/export/require-export-role.ts`) hace lo mismo pero devolviendo una respuesta HTTP 401/403 en vez de un `redirect()`, porque los Route Handlers no tienen a dónde "redirigir" al usuario en el mismo sentido que una página.

Hay una inconsistencia real entre lo que el menú de navegación muestra y lo que `requireRole` permite en `/admin/asignaciones` (visible en el menú para coordinador, pero gateado a solo administrador en el código de la página) — documentada en [`registro-decisiones-pendientes.md`](./registro-decisiones-pendientes.md).

## 6. Pipeline de importación y normalización

Los archivos fuente son `.xlsx` leídos en el navegador con la librería `xlsx` (SheetJS), vía `readWorkbookRows(file, sheetName)` (`src/lib/import/read-workbook.ts`), que exige el **nombre exacto de hoja** (ver `procedimiento-importacion.md` para los nombres literales usados en el código, incluyendo un espacio final en uno de ellos).

### 6.1 Códigos DANE: la trampa de la notación científica de Excel

`formatDaneCode()` (`src/lib/import/parse-institutions.ts`) existe porque, si la celda de código DANE se guarda como número en el Excel de origen, JavaScript puede recibirla ya convertida a notación científica o con precisión perdida al leerla como número de punto flotante. Como los códigos DANE tienen como máximo ~12 dígitos —muy por debajo de `Number.MAX_SAFE_INTEGER`— la función usa `Math.round(cell).toString()` para reconstruir el código completo sin notación científica y sin pérdida de precisión, en vez de tratarlo como texto desde el inicio (que perdería ceros a la izquierda si Excel lo autoconvirtió a número). Los códigos DANE se guardan siempre como `text` en la base de datos, nunca como tipo numérico, precisamente para no reintroducir este problema aguas abajo.

### 6.2 Reglas de sesión L1/L2/L3 y la reconciliación de 6.696

`src/lib/import/session-rules.ts` define cuántas sesiones se esperan por línea y actor:

| Línea | Estudiantes | Docentes | Directivos | Familias | Total por sede |
|---|---|---|---|---|---|
| L1 | 12 | 8 | 5 | 3 | 28 |
| L2 | 4 | 6 | 5 | 3 | 18 |
| L3 | 3 | 3 | 2 | 2 | 10 |

`reconcileTotalSessions()` multiplica el número de sedes de cada línea por el total de sesiones de esa línea y suma los tres resultados. La cifra de referencia verificada contra la fuente real es **`EXPECTED_TOTAL_SESSIONS = 6696`**. El asistente de importación de sedes calcula esta reconciliación en vivo, antes de confirmar, y la muestra con una marca visual (verde si coincide, ámbar si no) para que el administrador detecte cualquier discrepancia con el archivo fuente antes de escribir nada en la base de datos.

`normalizeLinea()` toma el valor crudo de la columna LINEA (que puede venir como `"L3 SD2"` u otras variantes con sufijos) y lo reduce a `L1`/`L2`/`L3` comparando solo el prefijo (`upper.startsWith("L3")`, etc.); el valor original completo se conserva en `institutions.sessions_raw` para auditoría, mientras que el valor normalizado va en `institutions.sessions_normalized` (redundante con `institutions.linea` en el esquema actual, pero conservado explícitamente como texto original vs. normalizado según el comentario de la migración 0001).

### 6.3 División de la celda combinada "07/08/09/10" del catálogo

`src/lib/import/parse-catalog.ts` lee la hoja `ESTRUCTURA_DETALLE` del archivo de matriz de tipos documentales. Dos particularidades reales del archivo fuente que el parser maneja explícitamente:

- Las columnas SUBSECCIÓN y DESCRIPCIÓN solo están pobladas en la primera fila de cada grupo visual de Excel (el resto de filas del grupo las dejan vacías por el combinado visual de celdas); el parser **propaga hacia abajo** (`currentSectionCell`, `currentDescription`) el último valor no vacío visto.
- Las filas correspondientes a las sesiones por actor traen la celda SUBSECCIÓN como una única celda con **saltos de línea** internos: `"07_ESTUDIANTES\n08_DOCENTES\n09_DIRECTIVOS\n10_FAMILIAS"`. El parser divide ese texto por saltos de línea y genera **una entrada de catálogo por cada subsección resultante** (`sectionCodes.forEach` dentro del bucle principal), asignando el actor correspondiente según el prefijo de dos dígitos (`07` → estudiantes, `08` → docentes, `09` → directivos, `10` → familias, vía `ACTOR_BY_SECTION_PREFIX`).

Las extensiones permitidas se infieren por expresión regular sobre el texto de la evidencia (no hay columna explícita de extensión en el archivo); la nomenclatura permitida admite múltiples patrones válidos separados por saltos de línea en la misma celda.

### 6.4 Reglas de obligatoriedad ambiguas

Cuando la columna OBLIGATORIO no es exactamente `"1"` ni `"0"`, el parser **no infiere** un valor por defecto silencioso: marca la entrada con `ruleStatus = "pendiente_parametrizacion"` (tratándola como obligatoria mientras tanto, para no perder cobertura) y la reporta en `ambiguousRows`. Esto se refleja en la base de datos como `applicability_rules.status = 'pendiente_parametrizacion'` — el comentario de la migración 0001 es explícito: *"Reglas ambiguas deben registrarse con status = pendiente_parametrizacion, nunca inferirse."*

### 6.5 Generación de `expected_documents`

`generateExpectedDocuments()` (`src/lib/import/generate-expected-documents.ts`) cruza sedes (con su línea) y entradas de catálogo (con su actor). Para entradas de catálogo **con actor** (subsecciones 07-10), genera un `expected_document` por cada número de sesión esperado según `SESSION_COUNTS[linea][actor]`. Para entradas **sin actor** (documentos generales por sede), genera un único `expected_document` por sede (sesión 1). La identidad lógica de un `expected_document` (reforzada por un índice único en Postgres con `coalesce(...)` sobre actor/sesión para tratar `NULL` como un valor comparable) es: **sede + subsección + actor + sesión + tipo documental**.

### 6.6 Verificación: `scripts/smoke-test-import.ts`

Script de verificación manual (no forma parte del build ni de ningún test automatizado) que ejercita el pipeline completo de parseo contra los archivos `.xlsx` **reales**, sin escribir nada en ninguna base de datos. Corre los parsers, calcula la reconciliación de 6.696, genera `expected_documents` en memoria (con IDs sintéticos) y verifica tres aserciones:

- Exactamente 306 sedes válidas.
- La reconciliación de sesiones coincide con 6.696.
- El número de "slots de sesión" distintos (sede + actor + número de sesión) generados coincide con 6.696.

Para ejecutarlo contra los archivos fuente reales:

```bash
npx tsx scripts/smoke-test-import.ts <ruta_base_unificada.xlsx> <ruta_catalogo.xlsx>
```

o definiendo las variables de entorno `BASE_UNIFICADA_XLSX` y `CATALOGO_XLSX`. El script termina con código de salida distinto de cero (y mensajes `❌`) si alguna de las tres verificaciones falla, así que puede usarse como chequeo previo a una importación real en producción.

## 7. Variables de entorno

Definidas en `.env.example` (cópialo a `.env.local`, nunca lo subas al repositorio):

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. Pública. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase, sujeta a RLS. Pública. |
| `NEXT_PUBLIC_SITE_URL` | URL base del sitio (por defecto `http://localhost:3000` en desarrollo). |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio con privilegios administrativos. **Solo** para código de servidor (invitación de usuarios, scripts). Nunca exponer al cliente. |

## 8. Cómo correr el proyecto localmente

Requiere Node.js compatible con Next.js 16 y npm.

```bash
npm install
cp .env.example .env.local   # y completar con los valores del proyecto Supabase
npm run dev                  # servidor de desarrollo, http://localhost:3000
npm run build                # build de producción
npm run start                # sirve el build de producción
npm run lint                 # ESLint (eslint-config-next)
```

Sin un proyecto Supabase configurado y sus migraciones aplicadas (`supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_views.sql`, en ese orden), la aplicación arranca pero la mayoría de pantallas mostrarán mensajes de "la base de datos no está conectada todavía" en vez de datos — esto es un comportamiento intencional de las páginas (no un error no manejado), pensado para que el proyecto sea navegable incluso sin backend configurado durante el desarrollo de la interfaz.

## 9. Dependencias relevantes (`package.json`)

- **Next.js 16.3.0**, **React 19.2.8** — App Router, Server Actions.
- **@supabase/ssr** + **@supabase/supabase-js** — clientes Supabase (ver sección 3).
- **xlsx** (SheetJS, instalado desde el CDN oficial `cdn.sheetjs.com`, no desde npm registry) — lectura de archivos Excel en el navegador y en el script de smoke test, y escritura de los `.xlsx` de exportación.
- **zod** + **react-hook-form** + **@hookform/resolvers** — validación de formularios (disponibles en el proyecto; no todos los formularios actuales los usan explícitamente, algunos usan Server Actions con `FormData` nativo).
- **date-fns** — utilidades de fecha.
- **tailwindcss v4** + **class-variance-authority** + **clsx** + **tailwind-merge** — estilos.
- **lucide-react** — iconos.
- **tsx** (dev) — para correr `scripts/smoke-test-import.ts` sin compilar.
