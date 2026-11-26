import { ALERT_SEVERITIES } from '@darmawanweb/ais-its-contracts/domain';

import type { AisStatsDto } from '@/shared/api/generated/ais-processor/model';
import type { DailyCiiPointDto, GradeCountsDto } from '@/shared/api/generated/emission/model';
import type { AlertDto } from '@/shared/api/generated/notification/model';
import type { SafetyVesselStateDto } from '@/shared/api/generated/safety/model';

const DAY = 86_400_000;

export interface AlertDayRow {
  /** Start of the UTC day (ISO). */
  day: string;
  info: number;
  warning: number;
  critical: number;
  total: number;
}

/** Start of the UTC day of an instant. */
export function utcDayStart(time: number): number {
  return Math.floor(time / DAY) * DAY;
}

/**
 * Alerts per UTC day and severity over the last `days` days (oldest first), by first
 * occurrence; days without alerts are zero rows so the chart keeps its time axis.
 */
export function alertTimeline(
  alerts: readonly Pick<AlertDto, 'occurredAt' | 'severity'>[],
  now: number,
  days = 7,
): AlertDayRow[] {
  const first = utcDayStart(now) - (days - 1) * DAY;
  const rows: AlertDayRow[] = Array.from({ length: days }, (_, index) => ({
    day: new Date(first + index * DAY).toISOString(),
    info: 0,
    warning: 0,
    critical: 0,
    total: 0,
  }));
  for (const alert of alerts) {
    const index = Math.floor((utcDayStart(Date.parse(alert.occurredAt)) - first) / DAY);
    const row = rows[index];
    if (!row) continue;
    const severity = (ALERT_SEVERITIES as readonly string[]).includes(alert.severity)
      ? alert.severity
      : 'info';
    row[severity] += 1;
    row.total += 1;
  }
  return rows;
}

export interface EwsCounts {
  danger: number;
  warning: number;
  /** Names (or MMSIs) of the vessels in danger, for the card. */
  dangerVessels: { mmsi: number; name: string }[];
}

/** Vessels per EWS status (0 danger, 1 warning) from `GET /safety/vessels?ewsStatus=0,1`. */
export function ewsCounts(
  states: readonly Pick<SafetyVesselStateDto, 'mmsi' | 'ewsStatus' | 'vessel'>[],
): EwsCounts {
  const counts: EwsCounts = { danger: 0, warning: 0, dangerVessels: [] };
  for (const state of states) {
    if (state.ewsStatus === 0) {
      counts.danger += 1;
      counts.dangerVessels.push({
        mmsi: state.mmsi,
        name: state.vessel?.name ?? String(state.mmsi),
      });
    } else if (state.ewsStatus === 1) counts.warning += 1;
  }
  return counts;
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

/** Fuel (ME + AE, t) of the current month and year from daily CII points of every vessel. */
export function fuelTotals(
  points: readonly Pick<DailyCiiPointDto, 'day' | 'fuelMeTon' | 'fuelAeTon'>[],
  now: number,
) {
  const today = new Date(now);
  const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const yearStart = Date.UTC(today.getUTCFullYear(), 0, 1);
  let month = 0;
  let year = 0;
  for (const point of points) {
    const day = Date.parse(point.day);
    if (Number.isNaN(day) || day < yearStart) continue;
    const fuel = point.fuelMeTon + point.fuelAeTon;
    year += fuel;
    if (day >= monthStart) month += fuel;
  }
  return { month, year };
}

export interface RateSample {
  at: number;
  primary: number;
  batam: number;
  pusher: number;
  total: number;
}

/** A sample of the AIS message rate per source (`GET /ais/stats`). */
export function rateSample(stats: AisStatsDto, at: number): RateSample {
  return {
    at,
    primary: stats.bySource.primary.messagesLastMinute,
    batam: stats.bySource.batam.messagesLastMinute,
    pusher: stats.bySource.pusher.messagesLastMinute,
    total: stats.messagesLastMinute,
  };
}

/** Appends a sample, keeping the newest `max` (replaces a sample of the same instant). */
export function pushSample(
  history: readonly RateSample[],
  sample: RateSample,
  max = 60,
): RateSample[] {
  const kept = history.filter((item) => item.at !== sample.at);
  return [...kept, sample].sort((a, b) => a.at - b.at).slice(-max);
}
