/**
 * Rate limiting de intentos de login, en memoria del proceso. No es a prueba de
 * balanceo entre múltiples instancias serverless (cada una tiene su propio conteo),
 * pero para una app interna de ~20 usuarios sigue siendo una barrera real contra
 * fuerza bruta automatizada: limita intentos por correo, no por IP (más robusto
 * aquí, ya que los 20 usuarios comparten redes institucionales y una IP no
 * identifica a un atacante de forma confiable en ese contexto).
 */
const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_ATTEMPTS = 8;

const attemptsByEmail = new Map<string, number[]>();

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < WINDOW_MS);
}

/** true = bloqueado (ya superó el límite en la ventana actual). */
export function isRateLimited(email: string): boolean {
  const now = Date.now();
  const timestamps = prune(attemptsByEmail.get(email) ?? [], now);
  attemptsByEmail.set(email, timestamps);
  return timestamps.length >= MAX_ATTEMPTS;
}

/** Registra un intento fallido. Los exitosos no se registran (no penalizan). */
export function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const timestamps = prune(attemptsByEmail.get(email) ?? [], now);
  timestamps.push(now);
  attemptsByEmail.set(email, timestamps);
}

/** Limpia el contador tras un login exitoso. */
export function clearAttempts(email: string): void {
  attemptsByEmail.delete(email);
}
