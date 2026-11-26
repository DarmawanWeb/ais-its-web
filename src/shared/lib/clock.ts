/**
 * The clock of the UI, kept out of render bodies (components stay pure) and in one place so
 * tests can mock it (`vi.spyOn(clock, 'nowMs')` or fake timers).
 */

/** Current time in ms. */
export function nowMs(): number {
  return Date.now();
}

/** Current calendar year in UTC: the CII year of the emission service. */
export function currentYear(): number {
  return new Date(nowMs()).getUTCFullYear();
}
