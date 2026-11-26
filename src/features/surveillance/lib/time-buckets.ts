const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Bucket sizes of the overview time series, smallest first. */
export const BUCKET_SIZES_MS = [
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
] as const;

export interface TimeBucket {
  /** Inclusive start (ISO-8601). */
  from: string;
  /** Exclusive end (ISO-8601); the last bucket ends at the range end. */
  to: string;
  /** Bucket size, ms. */
  sizeMs: number;
}

/**
 * Splits `[from, to)` into at most `maxBuckets` aligned buckets (hour sizes align to UTC hours,
 * day sizes to UTC midnight). The first bucket starts at `from`, the last ends at `to`, so the
 * buckets cover the range exactly. Used to query `GET /surveillance/stats` per bucket (the
 * service has no time-series endpoint yet).
 */
export function buildBuckets(from: Date, to: Date, maxBuckets = 14): TimeBucket[] {
  const start = from.getTime();
  const end = to.getTime();
  if (!(end > start) || maxBuckets < 1) return [];
  const span = end - start;
  const size =
    BUCKET_SIZES_MS.find((candidate) => span / candidate <= maxBuckets) ??
    Math.ceil(span / maxBuckets);
  const buckets: TimeBucket[] = [];
  let cursor = start;
  let boundary = Math.floor(start / size) * size + size;
  while (cursor < end) {
    const next = Math.min(boundary, end);
    buckets.push({
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString(),
      sizeMs: size,
    });
    cursor = next;
    boundary += size;
  }
  // Alignment can add one partial bucket: merge the first two so the cap holds.
  if (buckets.length > maxBuckets && buckets.length >= 2) {
    const [first, second, ...rest] = buckets as [TimeBucket, TimeBucket, ...TimeBucket[]];
    return [{ from: first.from, to: second.to, sizeMs: size }, ...rest];
  }
  return buckets;
}

/** `true` when the buckets are whole days or longer (labels then omit the time of day). */
export function isDailyBucket(bucket: Pick<TimeBucket, 'sizeMs'>): boolean {
  return bucket.sizeMs >= DAY;
}
