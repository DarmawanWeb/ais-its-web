import { isApiProblem } from '@/shared/api/problem';

/** Friendly message keys (`seemp:problems.<key>.title|description`) of emission problems. */
export type SeempProblemKey =
  | 'notAvailable'
  | 'vesselNotFound'
  | 'forbidden'
  | 'reductionFactorMissing'
  | 'measureUnknown'
  | 'incompatible'
  | 'scenarioNotFound'
  | 'validation';

const BY_CODE: Record<string, SeempProblemKey> = {
  CII_NOT_AVAILABLE: 'notAvailable',
  VESSEL_NOT_FOUND: 'vesselNotFound',
  FORBIDDEN: 'forbidden',
  REDUCTION_FACTOR_MISSING: 'reductionFactorMissing',
  SEEMP_MEASURE_UNKNOWN: 'measureUnknown',
  SEEMP_MEASURES_INCOMPATIBLE: 'incompatible',
  SEEMP_SCENARIO_NOT_FOUND: 'scenarioNotFound',
  VALIDATION_FAILED: 'validation',
};

/** Maps an emission service problem (README "Error codes") to a translated message key. */
export function seempProblemKey(error: unknown): SeempProblemKey | null {
  if (!isApiProblem(error) || error.kind !== 'http') return null;
  return BY_CODE[error.code] ?? (error.status === 403 ? 'forbidden' : null);
}
