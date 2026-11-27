import type { TrafficSeriesDto } from '@/shared/api/generated/ais-processor/model';
import type { GradeCountsDto } from '@/shared/api/generated/emission/model';
import type { AlertSeriesDto } from '@/shared/api/generated/notification/model';

export interface AlertDayRow {
  /** Start of the (local) day bucket (ISO). */
  day: string;
  info: number;
  warning: number;
  critical: number;
  total: number;
}

/** Rows of the 7-day chart from `GET /alerts/stats/series?bucket=1d&groupBy=severity`. */
export function alertSeriesRows(series: Pick<AlertSeriesDto, 'buckets'>): AlertDayRow[] {
  return series.buckets.map((bucket) => {
    const count = (key: string) => bucket.counts[key] ?? 0;
    return {
      day: bucket.from,
      info: count('info'),
      warning: count('warning'),
      critical: count('critical'),
      total: bucket.total,
    };
  });
}

/** Surveillance detector types in display order (contracts `KNOWN_ALERT_TYPES` of the domain). */
export const SURVEILLANCE_TYPES = [
  'transhipment',
  'fishing',
  'dark',
  'anomaly',
  'geofence',
] as const;

export const SURVEILLANCE_METHOD: Record<(typeof SURVEILLANCE_TYPES)[number], string> = {
  transhipment: 'transhipment.accuracy',
  fishing: 'fishing.loitering',
  dark: 'dark.ais_gap',
  anomaly: 'anomaly.navstatus_mismatch',
  geofence: 'geo.geofence_enter',
};

/** Rows of the surveillance card: the known types (0 when absent) then any other type present. */
export function surveillanceRows(
  byType: Readonly<Record<string, number>>,
): { type: string; count: number }[] {
  const known = SURVEILLANCE_TYPES.map((type) => ({ type, count: byType[type] ?? 0 }));
  const others = Object.entries(byType)
    .filter(([type]) => !(SURVEILLANCE_TYPES as readonly string[]).includes(type))
    .map(([type, count]) => ({ type, count }));
  return [...known, ...others];
}

/** Share of each CII grade (0–1) and the number of rated vessels. */
export function gradeShares(grades: GradeCountsDto) {
  const rated = grades.A + grades.B + grades.C + grades.D + grades.E;
  const share = (count: number) => (rated > 0 ? count / rated : 0);
  return {
    rated,
    shares: {
      A: share(grades.A),
      B: share(grades.B),
      C: share(grades.C),
      D: share(grades.D),
      E: share(grades.E),
    },
  };
}

export interface RateSample {
  at: number;
  primary: number;
  batam: number;
  pusher: number;
  total: number;
}

/**
 * Messages per minute and source of each bucket of `GET /ais/stats/series` (a bucket's
 * `messages` divided by its sampled minutes; buckets without samples are gaps).
 */
export function rateSeries(series: Pick<TrafficSeriesDto, 'points'>): RateSample[] {
  return series.points
    .filter((point) => point.samples > 0)
    .map((point) => {
      const perMinute = (messages: number) => Math.round((messages / point.samples) * 10) / 10;
      return {
        at: Date.parse(point.at),
        primary: perMinute(point.bySource.primary.messages),
        batam: perMinute(point.bySource.batam.messages),
        pusher: perMinute(point.bySource.pusher.messages),
        total: perMinute(point.messages),
      };
    });
}
