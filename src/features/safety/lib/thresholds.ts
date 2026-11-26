import {
  EWS_DANGER_DISTANCE_M,
  EWS_WARNING_DISTANCE_M,
  type CollisionRisk,
} from '@darmawanweb/ais-its-contracts/domain';

import type { DetectorDescriptionDto } from '@/shared/api/generated/safety/model';

/**
 * Active thresholds of the safety detectors: `GET /safety/detectors` returns each detector's
 * `<ID>_*` configuration (prefix removed, e.g. `DANGER_M`); when the service does not answer or
 * a value is missing, the documented defaults apply (spec §13.7, methodology catalog).
 */
export type ThresholdSource = 'detector' | 'default';

export interface EwsThresholds {
  dangerM: number;
  warningM: number;
  source: ThresholdSource;
}

export interface CollisionBand {
  cpaNm: number;
  tcpaMin: number;
}

export interface CollisionThresholds {
  high: CollisionBand;
  medium: CollisionBand;
  low: CollisionBand;
  /** Fraction by which a pair's limits widen before it leaves its band. */
  hysteresis: number;
  searchRadiusNm: number;
  maxAgeS: number;
  minSogKn: number;
  source: ThresholdSource;
}

/** Spec §13.7 design defaults (need domain validation, catalog `needsCitation`). */
export const DEFAULT_COLLISION_THRESHOLDS: CollisionThresholds = {
  high: { cpaNm: 0.25, tcpaMin: 6 },
  medium: { cpaNm: 0.5, tcpaMin: 12 },
  low: { cpaNm: 1, tcpaMin: 20 },
  hysteresis: 0.2,
  searchRadiusNm: 6,
  maxAgeS: 120,
  minSogKn: 0.5,
  source: 'default',
};

export const DEFAULT_EWS_THRESHOLDS: EwsThresholds = {
  dangerM: EWS_DANGER_DISTANCE_M,
  warningM: EWS_WARNING_DISTANCE_M,
  source: 'default',
};

function numberOf(config: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = config?.[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function configOf(
  detectors: readonly DetectorDescriptionDto[] | undefined,
  id: string,
): Record<string, unknown> | null {
  const detector = detectors?.find((d) => d.id === id && d.enabled);
  return detector?.config && typeof detector.config === 'object' ? detector.config : null;
}

export function ewsThresholdsOf(
  detectors: readonly DetectorDescriptionDto[] | undefined,
): EwsThresholds {
  const config = configOf(detectors, 'ews');
  const dangerM = numberOf(config, 'DANGER_M');
  const warningM = numberOf(config, 'WARNING_M');
  if (dangerM === null || warningM === null || dangerM >= warningM) return DEFAULT_EWS_THRESHOLDS;
  return { dangerM, warningM, source: 'detector' };
}

export function collisionThresholdsOf(
  detectors: readonly DetectorDescriptionDto[] | undefined,
): CollisionThresholds {
  const config = configOf(detectors, 'collision');
  if (!config) return DEFAULT_COLLISION_THRESHOLDS;
  const d = DEFAULT_COLLISION_THRESHOLDS;
  const pick = (key: string, fallback: number) => numberOf(config, key) ?? fallback;
  return {
    high: {
      cpaNm: pick('HIGH_CPA_NM', d.high.cpaNm),
      tcpaMin: pick('HIGH_TCPA_MIN', d.high.tcpaMin),
    },
    medium: {
      cpaNm: pick('MEDIUM_CPA_NM', d.medium.cpaNm),
      tcpaMin: pick('MEDIUM_TCPA_MIN', d.medium.tcpaMin),
    },
    low: { cpaNm: pick('LOW_CPA_NM', d.low.cpaNm), tcpaMin: pick('LOW_TCPA_MIN', d.low.tcpaMin) },
    hysteresis: pick('HYSTERESIS', d.hysteresis),
    searchRadiusNm: pick('SEARCH_RADIUS_NM', d.searchRadiusNm),
    maxAgeS: pick('MAX_AGE_S', d.maxAgeS),
    minSogKn: pick('MIN_SOG_KN', d.minSogKn),
    source: 'detector',
  };
}

/**
 * Band of a CPA/TCPA sample without hysteresis (what the limits say; the detector's band of a
 * sample — `risk` — also depends on the pair's previous band).
 */
export function bandOf(
  cpaNm: number,
  tcpaMin: number | null,
  thresholds: CollisionThresholds = DEFAULT_COLLISION_THRESHOLDS,
): CollisionRisk {
  if (tcpaMin === null || tcpaMin < 0) return 'none';
  for (const band of ['high', 'medium', 'low'] as const) {
    const limit = thresholds[band];
    if (cpaNm < limit.cpaNm && tcpaMin < limit.tcpaMin) return band;
  }
  return 'none';
}
