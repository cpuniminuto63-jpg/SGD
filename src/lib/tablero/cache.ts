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

async function compute(): Promise<TableroData> {
  const data = await buildTableroFromDb(null);
  cached = { data, computedAt: Date.now() };
  return data;
}

/** Devuelve el dataset completo, calculándolo si todavía no hay nada en caché (primer
 * request tras un reinicio del servidor) o si ya venció -- nunca deja dos cálculos
 * concurrentes cuando varias personas piden el dashboard al mismo tiempo justo cuando
 * la caché está vacía. */
export async function getFullTablero(): Promise<{ data: TableroData; computedAt: number }> {
  const vencida = !cached || Date.now() - cached.computedAt > REFRESH_MS;
  if (vencida && !inFlight) {
    inFlight = compute().finally(() => {
      inFlight = null;
    });
  }
  if (!cached) await inFlight;
  return cached!;
}

/** Fuerza un recálculo inmediato (botón "Actualizar ahora", solo administrador). */
export async function refreshTableroNow(): Promise<{ data: TableroData; computedAt: number }> {
  if (!inFlight) inFlight = compute().finally(() => (inFlight = null));
  await inFlight;
  return cached!;
}

/** Arranca el refresco periódico. Se llama una sola vez desde instrumentation.ts al
 * iniciar el proceso -- import.meta / module-level side effects no bastan porque Next
 * puede cargar este módulo más de una vez en distintos workers. */
export function startTableroRefreshLoop() {
  if (timer) return;
  // Primer cálculo en segundo plano apenas arranca el proceso, para que el primer
  // usuario del día no pague el costo de la consulta.
  compute().catch((e) => console.error("[tablero] error precargando dashboard:", e));
  timer = setInterval(() => {
    compute().catch((e) => console.error("[tablero] error refrescando dashboard:", e));
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
