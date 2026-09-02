import { sql, type SQL } from "drizzle-orm";

/**
 * Construye la condición `institution_id in (...)` para usar dentro de SQL crudo
 * (`db.execute(sql\`...\`)`) contra las vistas, que no son tablas Drizzle-tipadas.
 *
 * NO usar `institution_id = any(${ids}::uuid[])`: pasar un array de JS como parámetro
 * a través de drizzle-orm hacia postgres.js NO lo serializa como literal de arreglo de
 * Postgres (produce "malformed array literal" en tiempo de ejecución) — solo funciona
 * si se usa el tag `sql` nativo de postgres.js directamente, no el de drizzle-orm. Un
 * IN (...) con un parámetro por valor evita el problema por completo.
 *
 * Si `ids` está vacío (revisor sin sedes asignadas), devuelve una condición que nunca
 * es verdadera en vez de generar `IN ()`, que es SQL inválido.
 *
 * Vive en su propio archivo (no en visible-institutions.ts) para que sede-status.ts
 * pueda importarla sin crear un ciclo: visible-institutions.ts necesita el resultado de
 * sede-status.ts (getSedeOverallStatusMap) para los roles "sgd" y "coordinador_eafit".
 */
export function institutionIdInFilter(ids: string[]): SQL {
  if (ids.length === 0) {
    return sql`institution_id = '00000000-0000-0000-0000-000000000000'::uuid`;
  }
  return sql`institution_id in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )})`;
}
