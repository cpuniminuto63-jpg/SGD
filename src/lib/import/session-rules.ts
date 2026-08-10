import type { ActorTipo, LineaCPE } from "@/lib/db/types";

// Sección 7 del prompt maestro — sesiones esperadas por línea y actor.
export const SESSION_COUNTS: Record<LineaCPE, Record<ActorTipo, number>> = {
  L1: { estudiantes: 12, docentes: 8, directivos: 5, familias: 3 },
  L2: { estudiantes: 4, docentes: 6, directivos: 5, familias: 3 },
  L3: { estudiantes: 3, docentes: 3, directivos: 2, familias: 2 },
};

export const TOTAL_SESSIONS_BY_LINE: Record<LineaCPE, number> = {
  L1: Object.values(SESSION_COUNTS.L1).reduce((a, b) => a + b, 0), // 28
  L2: Object.values(SESSION_COUNTS.L2).reduce((a, b) => a + b, 0), // 18
  L3: Object.values(SESSION_COUNTS.L3).reduce((a, b) => a + b, 0), // 10
};

export const EXPECTED_TOTAL_SESSIONS = 6696;

/**
 * Normaliza el valor de línea tal como viene en la fuente (ej. " L1 ", "L3 SD2")
 * a un valor canónico L1/L2/L3, conservando el original para auditoría.
 */
export function normalizeLinea(raw: string): { normalized: LineaCPE | null; original: string } {
  const original = raw.trim();
  const upper = original.toUpperCase();

  if (upper.startsWith("L1")) return { normalized: "L1", original };
  if (upper.startsWith("L2")) return { normalized: "L2", original };
  if (upper.startsWith("L3")) return { normalized: "L3", original };

  return { normalized: null, original };
}

export function reconcileTotalSessions(countByLinea: Record<LineaCPE, number>): {
  total: number;
  matchesExpected: boolean;
  breakdown: Record<LineaCPE, number>;
} {
  const breakdown = {
    L1: countByLinea.L1 * TOTAL_SESSIONS_BY_LINE.L1,
    L2: countByLinea.L2 * TOTAL_SESSIONS_BY_LINE.L2,
    L3: countByLinea.L3 * TOTAL_SESSIONS_BY_LINE.L3,
  } as Record<LineaCPE, number>;

  const total = breakdown.L1 + breakdown.L2 + breakdown.L3;

  return { total, matchesExpected: total === EXPECTED_TOTAL_SESSIONS, breakdown };
}
