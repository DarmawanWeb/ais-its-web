const HOUR = 3_600_000;

/** Hours of raw readings before the newest reading searched for the latest ones (raw ≤ 31 d). */
export const LATEST_WINDOW_HOURS = 30 * 24;

/**
 * Time window `[newest − 30 d, newest + 1 s)` of the raw series read newest first
 * (`order=desc`) for the latest readings; `null` without a reading or with an invalid time.
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
