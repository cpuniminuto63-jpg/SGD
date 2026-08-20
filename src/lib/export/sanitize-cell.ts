/**
 * Neutraliza inyección de fórmulas CSV/Excel: si un valor de texto (que puede venir
 * de un comentario u observación escrita por cualquier usuario) empieza con
 * =, +, -, @, tab o retorno de carro, Excel/Sheets puede interpretarlo como fórmula
 * al abrir el archivo exportado. Se le antepone un apóstrofo para forzarlo a texto
 * plano, igual que hace Excel manualmente. No toca números ni booleanos.
 */
export function sanitizeCell<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

/** Aplica sanitizeCell a todos los valores string de un objeto plano (una fila). */
export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out = {} as T;
  for (const key of Object.keys(row) as (keyof T)[]) {
    out[key] = sanitizeCell(row[key]) as T[keyof T];
  }
  return out;
}
