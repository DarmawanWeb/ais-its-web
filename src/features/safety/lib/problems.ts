import type { ProblemCopy } from '@/shared/api/problem-copy';

/** Translated copies of the safety service's problem codes (spec §5; handbook error codes). */
export function safetyProblemCopies(
  t: (key: string) => string,
): Readonly<Record<string, ProblemCopy>> {
  return {
    VALIDATION_FAILED: { title: t('problems.validation'), detail: t('problems.validationDetail') },
    SAFETY_EVENT_NOT_FOUND: {
      title: t('problems.eventNotFound'),
      detail: t('problems.eventNotFoundDetail'),
    },
    SAFETY_STATE_NOT_FOUND: {
      title: t('problems.stateNotFound'),
      detail: t('problems.stateNotFoundDetail'),
    },
  };
}
