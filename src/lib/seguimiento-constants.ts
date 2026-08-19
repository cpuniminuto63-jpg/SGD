export const SEGUIMIENTO_DESDE = new Date("2026-08-18T00:00:00.000Z");

export function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DD en horario de Colombia (UTC-5), no UTC — para comparar contra `day` de review-timeline. */
export function todayInColombia(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
