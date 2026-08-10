# RevisaSGD

RevisaSGD es la herramienta interna con la que UNIMINUTO y Computadores para Educar hacen seguimiento a la revisión documental del proyecto CPE en las **306 sedes educativas** que lo componen (líneas L1, L2 y L3). En vez de rastrear manualmente en hojas de cálculo si cada evidencia esperada (actas, listas de asistencia, diagnósticos, comunicados, etc.) fue cargada correctamente al Sistema de Gestión Documental (SGD), RevisaSGD centraliza esa revisión: cada revisor marca el estado de cada documento con su observación, ese historial queda guardado para siempre (nunca se borra ni se edita, solo se agregan nuevas revisiones), y coordinadores y administradores pueden ver indicadores de avance, generar reportes y exportar los resultados en un formato compatible con el SGD legacy existente.

## Inicio rápido

Requiere Node.js (compatible con Next.js 16) y un proyecto Supabase con las migraciones aplicadas.

```bash
npm install
cp .env.example .env.local   # completar con los valores del proyecto Supabase
npm run dev                  # http://localhost:3000
```

Otros comandos disponibles:

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción
npm run lint     # ESLint
```

Variables de entorno requeridas (ver `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, y `SUPABASE_SERVICE_ROLE_KEY` (solo para código de servidor, nunca exponer al navegador).

Las migraciones de base de datos viven en `supabase/migrations/` (`0001_schema.sql`, `0002_rls.sql`, `0003_views.sql`) y deben aplicarse en ese orden sobre el proyecto Supabase antes de que la aplicación tenga datos reales con los que trabajar.

## Documentación

| Documento | Para quién |
|---|---|
| [`docs/manual-usuario.md`](./docs/manual-usuario.md) | Revisores, coordinadores y consulta: cómo revisar documentos, comentar apartados y leer indicadores. |
| [`docs/manual-administrador.md`](./docs/manual-administrador.md) | Administrador: cuentas, asignaciones, importación, exportación y auditoría. |
| [`docs/manual-tecnico.md`](./docs/manual-tecnico.md) | Desarrolladores: arquitectura, patrones de código, RLS, pipeline de importación, cómo correr el proyecto. |
| [`docs/diccionario-de-datos.md`](./docs/diccionario-de-datos.md) | Las 14 tablas y 6 vistas de la base de datos, columna por columna. |
| [`docs/procedimiento-importacion.md`](./docs/procedimiento-importacion.md) | Paso a paso para cargar sedes y catálogo documental. |
| [`docs/procedimiento-exportacion.md`](./docs/procedimiento-exportacion.md) | Cómo se generan los 3 archivos de exportación. |
| [`docs/procedimiento-integracion-sgd.md`](./docs/procedimiento-integracion-sgd.md) | Contrato de integración con la app SGD legacy (incluye advertencia sobre un mapeo pendiente de confirmar). |
| [`docs/diagrama-arquitectura.md`](./docs/diagrama-arquitectura.md) | Diagrama Mermaid de la arquitectura y los flujos de datos. |
| [`docs/registro-decisiones-pendientes.md`](./docs/registro-decisiones-pendientes.md) | Suposiciones, simplificaciones e inconsistencias detectadas que un humano debe revisar antes de producción. |

## Estado del proyecto

RevisaSGD está **en desarrollo activo**. Corresponde a la **Fase 1 (MVP)** del proyecto: revisión documental, historial inmutable, comentarios por apartado, importación de sedes y catálogo, indicadores básicos y exportación (incluyendo el archivo compatible con SGD legacy). Todavía **no está desplegado en producción** ni cargado con los datos reales de las 306 sedes.

Algunas piezas quedan explícitamente pendientes de decisión o confirmación antes de un lanzamiento a producción — el detalle completo, con dónde encontrarlas en el código, está en [`docs/registro-decisiones-pendientes.md`](./docs/registro-decisiones-pendientes.md). Entre las más relevantes: el mapeo de estados hacia la app SGD legacy es una suposición pendiente de confirmar con quien mantiene ese sistema, y hay una inconsistencia entre lo que el menú le muestra al rol coordinador en "Asignación de sedes" y lo que el control de acceso del servidor realmente le permite hacer allí.

No existe registro público de usuarios: todas las cuentas las crea el administrador desde el panel de RevisaSGD (ver `docs/manual-administrador.md`), y una posible integración de sincronización de archivos con Microsoft Graph/OneDrive (si estuviera prevista como fase futura) todavía no está construida.
