import { type ApiProblem, isApiProblem } from '@/shared/api/problem';

/** Friendly message keys (`cii:problems.<key>.title|description`) of emission service problems. */
export type CiiProblemKey =
  | 'notAvailable'
  | 'vesselNotFound'
  | 'forbidden'
  | 'reductionFactorMissing'
  | 'manualNotFound'
  | 'recomputeRange'
  | 'recomputeInProgress'
  | 'superAdminRequired'
  | 'jobNotFound'
  | 'validation';

const BY_CODE: Record<string, CiiProblemKey> = {
  CII_NOT_AVAILABLE: 'notAvailable',
  VESSEL_NOT_FOUND: 'vesselNotFound',
  FORBIDDEN: 'forbidden',
  REDUCTION_FACTOR_MISSING: 'reductionFactorMissing',
  CII_ANNUAL_MANUAL_NOT_FOUND: 'manualNotFound',
  RECOMPUTE_RANGE_INVALID: 'recomputeRange',
  RECOMPUTE_IN_PROGRESS: 'recomputeInProgress',
  SUPER_ADMIN_REQUIRED: 'superAdminRequired',
  PLATFORM_ADMIN_REQUIRED: 'superAdminRequired',
  RECOMPUTE_JOB_NOT_FOUND: 'jobNotFound',
  VALIDATION_FAILED: 'validation',
};

/**
 * Maps a failed emission call (emission README "Error codes") to a translated message key,
 * or `null` for problems the generic `<ErrorState>` explains well (network, 5xx…).
 */
export function ciiProblemKey(error: unknown): CiiProblemKey | null {
  if (!isApiProblem(error) || error.kind !== 'http') return null;
  const key = BY_CODE[error.code];
  if (key) return key;
  if (error.status === 403) return 'forbidden';
  return null;
}

/** True for `404 CII_NOT_AVAILABLE`: no counted segment and no manual record for the year. */
export function isCiiNotAvailable(error: unknown): boolean {
  return isApiProblem(error) && error.code === 'CII_NOT_AVAILABLE';
}

export function problemOf(error: unknown): ApiProblem | null {
  return isApiProblem(error) ? error : null;
}
