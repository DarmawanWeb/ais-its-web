import type { TFunction } from 'i18next';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiProblem, isApiProblem, toApiProblem } from './problem';

/** Translated copy of a problem code (title and optional explanation). */
export interface ProblemCopy {
  title: string;
  detail?: string;
}

/** Translated copies by problem code (`{ ZONE_NOT_FOUND: { title, detail } }`). */
export type ProblemCopies = Readonly<Record<string, ProblemCopy>>;

/**
 * The problem of a failed request with a translated title and explanation for the codes a
 * feature knows (the services answer in English), keeping status, code, field errors and the
 * trace id that `ErrorState` shows for support. Other problems are returned unchanged, so the
 * shared copy for network, 403, 429 and 5xx problems still applies.
 *
 * ```tsx
 * <ErrorState error={localizeProblem(query.error, zoneProblemCopies(t))} onRetry={query.refetch} />
 * ```
 */
export function localizeProblem(error: unknown, copies: ProblemCopies): ApiProblem | undefined {
  if (error === undefined || error === null) return undefined;
  const problem = isApiProblem(error) ? error : toApiProblem(error);
  const copy = Object.hasOwn(copies, problem.code) ? copies[problem.code] : undefined;
  if (!copy || problem.kind !== 'http') return problem;
  return new ApiProblem({
    kind: problem.kind,
    status: problem.status,
    code: problem.code,
    title: copy.title,
    type: problem.type,
    detail: copy.detail,
    instance: problem.instance,
    traceId: problem.traceId,
    requestId: problem.requestId,
    errors: problem.errors,
    retryAfterSeconds: problem.retryAfterSeconds,
    extensions: problem.extensions,
    cause: problem,
  });
}

/** One line for a toast: the localized title, then the explanation when there is one. */
export function problemSummary(error: unknown, copies: ProblemCopies): string {
  const problem = localizeProblem(error, copies);
  if (!problem) return '';
  return problem.detail ? `${problem.title}: ${problem.detail}` : problem.title;
}

const MISSING = '\u0000';

/**
 * User-facing message of a failed API call, for features that keep their copies as
 * `problems.<CODE>` keys of their namespace (pass the feature's `t`): that translation when it
 * exists (`{{seconds}}` is the Retry-After), otherwise a message for the kind of failure
 * (network, throttling, 403, server) or the problem's own detail.
 */
export function problemMessage(t: TFunction, error: unknown): string {
  const problem = toApiProblem(error);
  const seconds = problem.retryAfterSeconds ?? 60;
  const specific = t(`problems.${problem.code}`, { defaultValue: MISSING, seconds });
  if (specific !== MISSING) return specific;
  if (problem.kind === 'network' || problem.kind === 'timeout') return t('common:errors.network');
  if (problem.status === 429) return t('common:errors.rateLimitedRetry', { seconds });
  if (problem.status === 403) return t('common:errors.forbiddenDescription');
  if (problem.status >= 500) return t('common:errors.server');
  return problem.detail ?? (problem.title || t('common:errors.generic'));
}

/**
 * Puts the field errors of a `400 VALIDATION_FAILED` on a react-hook-form form, translated by
 * error code (`fieldErrors.<code>` of the feature's `t`, else the server message). Returns true
 * when at least one of `fields` received an error.
 */
export function applyFieldErrors<T extends FieldValues>(
  t: TFunction,
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  const problem = toApiProblem(error);
  let applied = false;
  for (const fieldError of problem.errors) {
    const field = fields.find((name) => name === fieldError.field);
    if (!field) continue;
    const message = fieldError.code
      ? t(`fieldErrors.${fieldError.code}`, { defaultValue: fieldError.message })
      : fieldError.message;
    setError(field, { type: 'server', message });
    applied = true;
  }
  return applied;
}
