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
