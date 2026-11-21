import type { TFunction } from 'i18next';

import { type ApiProblem, toApiProblem } from '@/shared/api/problem';

/** User-facing message of an auth endpoint failure (problem details codes of spec §13.1). */
export function authErrorMessage(error: unknown, t: TFunction): string {
  const problem: ApiProblem = toApiProblem(error);
  switch (problem.code) {
    case 'INVALID_CREDENTIALS':
      return t('auth:errors.invalidCredentials');
    case 'INVALID_MFA_CODE':
      return t('auth:errors.invalidMfaCode');
    case 'ACCOUNT_DISABLED':
      return t('auth:errors.accountDisabled');
    case 'INVALID_TOKEN':
      return t('auth:errors.invalidToken');
    default:
      break;
  }
  if (problem.status === 429) {
    return problem.retryAfterSeconds !== undefined
      ? t('auth:errors.throttled', { seconds: problem.retryAfterSeconds })
      : t('auth:errors.throttledNoTime');
  }
  if (problem.kind === 'network' || problem.kind === 'timeout') return t('errors.network');
  if (problem.status >= 500) return t('errors.server');
  if (problem.code === 'VALIDATION_FAILED' && problem.errors.length > 0) {
    return problem.errors.map((fieldError) => fieldError.message).join(' ');
  }
  return problem.detail ?? problem.title;
}

/** When a 429 lets the user retry (ms since epoch), or null. */
export function retryAt(error: unknown, now = Date.now()): number | null {
  const problem = toApiProblem(error);
  if (problem.status !== 429) return null;
  return now + (problem.retryAfterSeconds ?? 60) * 1000;
}
