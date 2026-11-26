import type { ProblemCopy } from '@/shared/api/problem-copy';

/** Translated copies of the notification service's problem codes (handbook error codes). */
export function alertProblemCopies(
  t: (key: string) => string,
): Readonly<Record<string, ProblemCopy>> {
  return {
    VALIDATION_FAILED: { title: t('problems.validation'), detail: t('problems.validationDetail') },
    ALERT_NOT_FOUND: { title: t('problems.notFound'), detail: t('problems.notFoundDetail') },
  };
}
