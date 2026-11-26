/** First year of the IMO CII regime (MARPOL Annex VI reg. 28, ratings from 2023). */
export const CII_FIRST_YEAR = 2023;

/** Calendar year (UTC), the unit of CII aggregation (G1, reg. 28). */
export function currentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

/** Selectable years, newest first: the current year back to `first`. */
export function yearOptions(now: Date = new Date(), first = CII_FIRST_YEAR): number[] {
  const last = currentYear(now);
  const years: number[] = [];
  for (let year = last; year >= Math.min(first, last); year -= 1) years.push(year);
  return years;
}

/** A year from a URL parameter, or `fallback` when missing or outside [min, max]. */
export function parseYear(
  value: string | null | undefined,
  fallback: number,
  min = 2000,
  max = 2200,
): number {
  if (!value || !/^\d{4}$/.test(value)) return fallback;
  const year = Number(value);
  return year >= min && year <= max ? year : fallback;
}

/** `from` / `to` (ISO-8601, UTC) of a calendar year; `to` is capped at now for the current year. */
export function yearRange(year: number, now: Date = new Date()): { from: string; to: string } {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return {
    from: new Date(start).toISOString(),
    to: new Date(Math.min(end, Math.max(start, now.getTime()))).toISOString(),
  };
}

/** Elapsed fraction of the calendar year at `at` (0–1). */
export function yearFraction(year: number, at: Date = new Date()): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return Math.min(1, Math.max(0, (at.getTime() - start) / (end - start)));
}
