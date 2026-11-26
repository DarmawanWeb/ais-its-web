import type { ReadingsControllerSeriesBucket } from '@/shared/api/generated/telemetry/model';

export type Bucket = ReadingsControllerSeriesBucket;
export type RangePreset = 'last24h' | 'last7d' | 'last30d' | 'thisYear';

export const RANGE_PRESETS: readonly RangePreset[] = ['last24h', 'last7d', 'last30d', 'thisYear'];
export const BUCKETS: readonly Bucket[] = ['raw', '1h', '1d'];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Longest range of each bucket (telemetry handbook: raw ≤ 31 d, 1h ≤ 366 d, 1d ≤ 5 y). */
export const BUCKET_MAX_MS: Readonly<Record<Bucket, number>> = {
  raw: 31 * DAY,
  '1h': 366 * DAY,
  '1d': 5 * 365 * DAY + 2 * DAY,
};

export interface TimeRange {
  from: string;
  to: string;
}

/** The range of a preset ending now (UTC instants; the API buckets are UTC). */
export function presetToRange(preset: RangePreset, now: number): TimeRange {
  const to = new Date(now);
  let from: Date;
  if (preset === 'last24h') from = new Date(now - DAY);
  else if (preset === 'last7d') from = new Date(now - 7 * DAY);
  else if (preset === 'last30d') from = new Date(now - 30 * DAY);
  else from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function rangeMs(range: TimeRange): number {
  return Date.parse(range.to) - Date.parse(range.from);
}

/** Buckets the API accepts for a range. */
export function allowedBuckets(range: TimeRange): Bucket[] {
  const length = rangeMs(range);
  return BUCKETS.filter((bucket) => length <= BUCKET_MAX_MS[bucket]);
}

/** Sensible bucket of a range: raw up to 2 days, hourly up to 2 weeks, then daily. */
export function defaultBucket(range: TimeRange): Bucket {
  const length = rangeMs(range);
  if (length <= 2 * DAY) return 'raw';
  if (length <= 14 * DAY) return '1h';
  return '1d';
}

/** The requested bucket when the range allows it, else the default one. */
export function effectiveBucket(requested: Bucket | null, range: TimeRange): Bucket {
  return requested && allowedBuckets(range).includes(requested) ? requested : defaultBucket(range);
}

export function isPreset(value: string | null): value is RangePreset {
  return value !== null && (RANGE_PRESETS as readonly string[]).includes(value);
}

export function isBucket(value: string | null): value is Bucket {
  return value !== null && (BUCKETS as readonly string[]).includes(value);
}
