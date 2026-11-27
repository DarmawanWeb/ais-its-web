import type { TimeBucket } from './time-buckets';
import { SURVEILLANCE_TYPES, type SurveillanceType } from './types';

export type SeriesRow = {
  from: string;
  to: string;
  total: number;
  /** `false` while the bucket's statistics are loading or failed. */
  loaded: boolean;
} & Record<SurveillanceType, number>;

/**
 * Rows of the "events by type over time" chart: one per bucket, the counts per type from the
 * bucket's `GET /surveillance/stats` (`byType`), zero for types without events.
 */
export function buildSeries(
  buckets: readonly TimeBucket[],
  stats: readonly ({ byType: Record<string, number> } | undefined)[],
): SeriesRow[] {
  return buckets.map((bucket, index) => {
    const byType = stats[index]?.byType;
    const counts = Object.fromEntries(
      SURVEILLANCE_TYPES.map((type) => [type, byType?.[type] ?? 0]),
    ) as Record<SurveillanceType, number>;
    return {
      from: bucket.from,
      to: bucket.to,
      loaded: byType !== undefined,
      total: SURVEILLANCE_TYPES.reduce((sum, type) => sum + counts[type], 0),
      ...counts,
    };
  });
}

/** Total per type over all rows (legend values, small multiples). */
export function totalsByType(rows: readonly SeriesRow[]): Record<SurveillanceType, number> {
  return Object.fromEntries(
    SURVEILLANCE_TYPES.map((type) => [type, rows.reduce((sum, row) => sum + row[type], 0)]),
  ) as Record<SurveillanceType, number>;
}

/** Share of `value` in `total` as a percentage (0 when the total is 0). */
export function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * Groups the buckets of `GET /surveillance/stats/series` (hours or local days, in order) into at
 * most `maxRows` consecutive groups for the chart, summing the counts per type.
 */
export function groupSeriesBuckets(
  buckets: readonly { from: string; to: string; byType: Record<string, number> }[],
  bucket: 'hour' | 'day',
  maxRows = 14,
): { buckets: TimeBucket[]; stats: { byType: Record<string, number> }[] } {
  const nominal = bucket === 'day' ? 86_400_000 : 3_600_000;
  const per = Math.max(1, Math.ceil(buckets.length / Math.max(1, maxRows)));
  const grouped: TimeBucket[] = [];
  const stats: { byType: Record<string, number> }[] = [];
  for (let index = 0; index < buckets.length; index += per) {
    const slice = buckets.slice(index, index + per);
    const first = slice[0]!;
    const last = slice.at(-1)!;
    const byType: Record<string, number> = {};
    for (const bucket of slice)
      for (const [type, count] of Object.entries(bucket.byType))
        byType[type] = (byType[type] ?? 0) + count;
    // The nominal size (a clipped first or last bucket is shorter): daily groups show dates.
    grouped.push({ from: first.from, to: last.to, sizeMs: slice.length * nominal });
    stats.push({ byType });
  }
  return { buckets: grouped, stats };
}
