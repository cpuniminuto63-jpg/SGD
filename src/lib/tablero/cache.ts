// Cachea en memoria del propio proceso Node (persistente en Hostinger, no serverless)
// el dataset COMPLETO del Dashboard (todas las sedes, sin restricción de perfil) y lo
// refresca solo cada REFRESH_MS -- así la base de datos se consulta una sola vez cada
// varias horas sin importar cuánta gente abra el Dashboard, y cada perfil filtra su
// propio alcance (visibleInstitutionIds) EN MEMORIA sobre ese mismo dataset, sin volver
// a tocar la base. A pedido del usuario (2026-09-24): reporte precargado en vez de
// recalcular en cada carga.
import { buildTableroFromDb, type TableroData, type Comentario } from "./build";

const REFRESH_MS = 5 * 60 * 60 * 1000; // 5 horas

let cached: { data: TableroData; computedAt: number } | null = null;
let inFlight: Promise<TableroData> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** Dispara un cálculo si no hay ya uno en curso -- SIEMPRE pasa por `inFlight`, tanto si
 * lo llama un request (getFullTablero/refreshTableroNow) como el arranque o el refresco
 * periódico, para que nunca haya dos consultas pesadas en paralelo. Si falla (p. ej. un
 * intento de conexión a Neon colgado -- ver connect_timeout en db/client.ts), lo registra
 * y libera `inFlight` para que el siguiente request (o el próximo intento) pueda
 * reintentar en vez de quedar bloqueado hasta el refresco de las 5 horas. */
function triggerCompute(): Promise<TableroData> {
  if (!inFlight) {
    inFlight = buildTableroFromDb(null)
      .then((data) => {
        cached = { data, computedAt: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Devuelve el dataset completo, calculándolo si todavía no hay nada en caché (primer
 * request tras un reinicio del servidor) o si ya venció -- nunca deja dos cálculos
 * concurrentes cuando varias personas piden el dashboard al mismo tiempo justo cuando
 * la caché está vacía. Si el cálculo falla y ya había algo en caché (aunque esté vencido),
 * sigue sirviendo eso último en vez de tumbar el dashboard entero por una falla puntual. */
export async function getFullTablero(): Promise<{ data: TableroData; computedAt: number }> {
  const vencida = !cached || Date.now() - cached.computedAt > REFRESH_MS;
  if (vencida) {
    try {
      await triggerCompute();
    } catch (e) {
      if (!cached) throw e;
      console.error("[tablero] no se pudo refrescar, sirviendo la copia anterior:", e);
    }
  }
  return cached!;
}

/** Fuerza un recálculo inmediato (botón "Actualizar ahora", solo administrador). */
export async function refreshTableroNow(): Promise<{ data: TableroData; computedAt: number }> {
  await triggerCompute();
  return cached!;
}

/** Arranca el refresco periódico. Se llama una sola vez desde instrumentation.ts al
 * iniciar el proceso -- import.meta / module-level side effects no bastan porque Next
 * puede cargar este módulo más de una vez en distintos workers. */
export function startTableroRefreshLoop() {
  if (timer) return;
  // Primer cálculo en segundo plano apenas arranca el proceso, para que el primer
  // usuario del día no pague el costo de la consulta. Si falla (p. ej. un problema de
  // red transitorio justo al arrancar), reintenta a los 30s en vez de quedarse sin datos
  // hasta el próximo refresco de las 5 horas.
  const primerIntento = () =>
    triggerCompute().catch((e) => {
      console.error("[tablero] error precargando dashboard, reintenta en 30s:", e);
      setTimeout(primerIntento, 30_000);
    });
  primerIntento();

  timer = setInterval(() => {
    triggerCompute().catch((e) => console.error("[tablero] error refrescando dashboard:", e));
  }, REFRESH_MS);
  if (typeof timer.unref === "function") timer.unref();
}

/** Filtra el dataset completo al alcance visible de un perfil (ver visibleInstitutionIds) sin
 * volver a consultar la base -- cd/ct/cw se dejan intactos (son diccionarios compartidos por
 * índice; que queden entradas sin usar para este perfil es inofensivo). */
export function scopeTablero(data: TableroData, institutionIds: string[] | null): TableroData {
  if (institutionIds === null) return data;
  const visible = new Set(institutionIds);
  const rows = data.rows.filter((r) => visible.has(r.id));
  const com: Comentario[] = data.com.filter((c) => visible.has(c[0]));
  const pendientesSedes = rows.reduce((sum, r) => sum + (r.t - r.c), 0);
  return {
    ...data,
    rows,
    com,
    checks: { pendientesSedes, filasComentarios: com.length, ok: pendientesSedes === com.length },
  };
}
