const HOUR = 3_600_000;

/** Hours of raw readings read before the newest reading to list the latest ones. */
export const LATEST_WINDOW_HOURS = 6;

/**
 * Time window `[newest − 6 h, newest + 1 s)` of the raw series holding the newest readings
 * (the readings API pages ascending only); `null` without a reading or with an invalid time.
 */
export function latestReadingsWindow(
  lastReadingAt: string | null | undefined,
): { from: string; to: string } | null {
  if (!lastReadingAt) return null;
  const newest = Date.parse(lastReadingAt);
  if (Number.isNaN(newest)) return null;
  return {
    from: new Date(newest - LATEST_WINDOW_HOURS * HOUR).toISOString(),
    to: new Date(newest + 1000).toISOString(),
  };
}
