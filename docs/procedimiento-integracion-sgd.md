# Procedimiento de integración con la app SGD legacy

> **Este documento describe un contrato de integración que es, en parte, una suposición razonable pendiente de confirmación.** No se asume que esté cerrado ni verificado contra el sistema legacy real. Ver la sección 4 y [`registro-decisiones-pendientes.md`](./registro-decisiones-pendientes.md) antes de depender de él en producción.

## 1. Qué resuelve esta integración

RevisaSGD no reemplaza a la app SGD legacy (`SGD_WEB_APP`) — coexiste con ella. El mecanismo de integración actual es **unidireccional y por archivo**: RevisaSGD genera un CSV con los resultados de calidad documental, y ese archivo se carga manualmente en SGD (no hay una API ni una sincronización en tiempo real entre ambos sistemas en el código actual).

El archivo se genera desde `/admin/exportaciones` → "Calidad documental detalle" → `GET /api/export/calidad-sgd`, implementado en `src/app/api/export/calidad-sgd/route.ts`.

## 2. Contrato de columnas — nombres y orden exactos

El archivo `calidad_documental_detalle_<fecha>.csv` tiene las siguientes columnas, **en este orden exacto, sin tildes**, tal como está codificado en el `interface CalidadSgdRow` de `src/app/api/export/calidad-sgd/route.ts`:

```
Coordinador,Departamento,Municipio,Institucion,Sede,DANE_sede,Mentor,Linea,Actor,Sesion,Documento,Estado_calidad,Observacion_SGD,Fuente_SGD
```

| Columna | Origen en RevisaSGD | Notas |
|---|---|---|
| `Coordinador` | `vw_estado_actual_documentos.coordinador` | Puede venir vacío (`null`) si la sede no tiene coordinador asociado. |
| `Departamento` | `.departamento` | |
| `Municipio` | `.municipio` | |
| `Institucion` | `.institucion` | |
| `Sede` | `.sede` | |
| `DANE_sede` | `.dane_sede` | Código DANE como texto. |
| `Mentor` | `.mentor` | Puede venir vacío. |
| `Linea` | `.linea` | `L1` / `L2` / `L3`. |
| `Actor` | `.actor` | `estudiantes` / `docentes` / `directivos` / `familias`, o vacío si es un documento general por sede. |
| `Sesion` | `.sesion` | Vacío si es un documento general por sede. |
| `Documento` | `.evidencia` | Nombre del tipo documental/evidencia. |
| `Estado_calidad` | `toSgdStatus(.estado_actual)` | **Traducido** al vocabulario SGD — ver sección 3. |
| `Observacion_SGD` | `.ultima_observacion` | Observación del último evento de revisión. |
| `Fuente_SGD` | constante `"RevisaSGD"` | Identifica el origen del dato para quien lo reciba en SGD. |

El código deja explícito en un comentario que este orden y estos nombres de columna son un **contrato externo** ("no modificar sin coordinar con el equipo dueño de la app SGD") — cualquier cambio aquí debe coordinarse con quien mantiene SGD_WEB_APP, no solo con el equipo de RevisaSGD.

El archivo se entrega con codificación UTF-8 y un BOM inicial, específicamente para que Excel muestre correctamente tildes y la ñ al abrirlo.

## 3. Mapeo de estados — vocabulario de RevisaSGD → vocabulario SGD

RevisaSGD maneja 6 estados de revisión (`ReviewStatus`). La app SGD legacy espera su propio vocabulario de texto libre en la columna `Estado_calidad`. El mapeo actual, definido en `src/lib/export/sgd-status-adapter.ts` (`SGD_STATUS_MAP`), es:

| Estado en RevisaSGD | Valor exportado a SGD |
|---|---|
| `cumple` | `"Cumple"` |
| `pendiente_subsanar` | `"Pendiente"` |
| `no_esta` | `"No cumple"` |
| `no_aplica` | `"No aplica"` |
| `reemplazado` | `"Cumple"` (se considera que el documento reemplazado ya cumple) |
| `pendiente_revision` | `"Pendiente"` (aún no evaluado, se reporta como pendiente) |

## 4. Advertencia explícita: este mapeo es una suposición pendiente de confirmar

El propio código lo documenta así, textualmente, en el comentario de `sgd-status-adapter.ts`:

> "No tenemos acceso directo al vocabulario exacto que usa SGD, así que este mapeo es una suposición razonable que debe ser confirmada por alguien con acceso al sistema legacy antes de depender de él en producción."

En la práctica, esto significa:

- **No hay garantía** de que la app SGD legacy realmente use exactamente los textos `"Cumple"`, `"Pendiente"`, `"No cumple"` y `"No aplica"` en su columna de estado de calidad. Podría usar otro vocabulario, otra capitalización, códigos numéricos, u otro idioma de etiqueta.
- **Antes de usar este CSV para cargar datos reales en producción en SGD**, alguien con acceso directo al sistema legacy (su base de datos, su documentación de importación, o su equipo de mantenimiento) debe confirmar el vocabulario exacto esperado.
- Si el vocabulario real difiere, el ajuste es **quirúrgico**: solo hace falta modificar el diccionario `SGD_STATUS_MAP` en `src/lib/export/sgd-status-adapter.ts`. El resto del exportador (columnas, orden, generación del CSV) no depende de los valores concretos de este mapeo.
- La decisión de mapear `reemplazado` → `"Cumple"` es una interpretación de negocio (un documento reemplazado ya está resuelto y por tanto cumple), no un hecho verificado contra SGD — también debería confirmarse.

Este ítem está además registrado formalmente en [`registro-decisiones-pendientes.md`](./registro-decisiones-pendientes.md) como una decisión abierta que un humano debe resolver antes de que esta integración se use para cargar datos reales en el sistema legacy.

## 5. Flujo operativo recomendado hasta que se confirme el vocabulario

1. Genera el archivo desde `/admin/exportaciones`.
2. Antes de cargarlo en SGD, revisa manualmente una muestra de filas contra lo que SGD espera en su propia interfaz o documentación.
3. Si el vocabulario coincide, procede con la carga normalmente.
4. Si no coincide, no cargues el archivo directamente: reporta la discrepancia a quien mantiene RevisaSGD para actualizar `SGD_STATUS_MAP`, y solo entonces vuelve a generar el archivo.
