import { compareCollisionRisk, type CollisionRisk } from '@darmawanweb/ais-its-contracts/domain';

import type { EncounterDto, EncounterSampleDto } from '@/shared/api/generated/safety/model';

/** An encounter is "active" while samples keep arriving (the detector samples every ≤ 30 s). */
export const ACTIVE_ENCOUNTER_WINDOW_MS = 5 * 60_000;

/** Sample with the smallest CPA (first one on ties), or null without samples. */
export function closestSample(encounter: Pick<EncounterDto, 'history'>): EncounterSampleDto | null {
  let best: EncounterSampleDto | null = null;
  for (const sample of encounter.history) {
    if (!best || sample.cpaNm < best.cpaNm) best = sample;
  }
  return best;
}

export function latestSample(encounter: Pick<EncounterDto, 'history'>): EncounterSampleDto | null {
  return encounter.history.at(-1) ?? null;
}

/** Duration from the first to the latest sample, minutes. */
export function encounterDurationMin(
  encounter: Pick<EncounterDto, 'startedAt' | 'lastSampleAt'>,
): number {
  const ms = Date.parse(encounter.lastSampleAt) - Date.parse(encounter.startedAt);
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : 0;
}

export function isEncounterActive(
  encounter: Pick<EncounterDto, 'lastSampleAt'>,
  now = Date.now(),
): boolean {
  return now - Date.parse(encounter.lastSampleAt) <= ACTIVE_ENCOUNTER_WINDOW_MS;
}

/** Ordering of risk bands, highest first (for sorting). */
export function compareRiskDesc(a: string, b: string): number {
  const known = (risk: string): risk is CollisionRisk =>
    risk === 'none' || risk === 'low' || risk === 'medium' || risk === 'high';
  if (!known(a) || !known(b)) return 0;
  return compareCollisionRisk(b, a);
}

export interface EncounterChartPoint {
  /** ms since epoch */
  time: number;
  cpaNm: number;
  /** null: no relative motion */
  tcpaMin: number | null;
  rangeNm: number;
  risk: string;
}

/** Series of the CPA/TCPA history chart (oldest first, invalid times dropped). */
export function encounterChartData(history: readonly EncounterSampleDto[]): EncounterChartPoint[] {
  return history
    .map((sample) => ({
      time: Date.parse(sample.time),
      cpaNm: sample.cpaNm,
      tcpaMin: sample.tcpaMin,
      rangeNm: sample.rangeNm,
      risk: sample.risk,
    }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
}

/** Window of the pair track request: the encounter with a margin, at most 7 days (raw tracks). */
export function pairTrackWindow(
  encounter: Pick<EncounterDto, 'startedAt' | 'lastSampleAt'>,
  marginMin = 15,
): { from: string; to: string } {
  const margin = marginMin * 60_000;
  const start = Date.parse(encounter.startedAt) - margin;
  const end = Math.min(Date.parse(encounter.lastSampleAt) + margin, Date.now());
  const from = Math.max(start, end - 7 * 24 * 3_600_000);
  return {
    from: new Date(from).toISOString(),
    to: new Date(Math.max(end, from + 60_000)).toISOString(),
  };
}

/** Time presets of the encounter list (`from` = now − preset; the API keeps ≤ 31 days). */
export const ENCOUNTER_RANGES = {
  '1h': 3_600_000,
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
  // Just under the API's 31-day limit (the server measures the range up to its own "now").
  '31d': 31 * 24 * 3_600_000 - 5 * 60_000,
} as const;

export type EncounterRange = keyof typeof ENCOUNTER_RANGES;

export function rangeStart(range: EncounterRange, now = Date.now()): string {
  return new Date(now - ENCOUNTER_RANGES[range]).toISOString();
}

/**
 * Axis ticks at the risk band limits: the axis minimum, the limits inside the axis, and the
 * axis maximum unless it would crowd the last limit (less than 12 % of the axis away).
 */
export function bandTicks(limits: readonly number[], min: number, max: number): number[] {
  const inside = [...new Set(limits)].filter((value) => value > min && value < max);
  const ticks = [min, ...inside.sort((a, b) => a - b)];
  const last = ticks[ticks.length - 1] ?? min;
  if (max - last > (max - min) * 0.12) ticks.push(max);
  return ticks;
}
