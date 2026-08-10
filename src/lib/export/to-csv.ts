// Serializador CSV mínimo, sin dependencias externas.
// Escapa campos que contienen comas, comillas dobles o saltos de línea según RFC 4180.

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convierte un arreglo de objetos en texto CSV.
 * `columns` define el orden exacto y el encabezado de cada columna
 * (clave = propiedad del objeto fuente, valor = encabezado en el CSV).
 */
export function toCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(row[c.key])).join(",")
  );
  // CRLF por compatibilidad con Excel/Windows; incluye BOM al escribir el Response.
  return [headerLine, ...lines].join("\r\n");
}
