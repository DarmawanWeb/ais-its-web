import type { ProblemCopy } from '@/shared/api/problem-copy';

/** Translated copies of the AIS processor's track problems (handbook: raw ≤ 7 d, 1m ≤ 90 d). */
export function trackProblemCopies(
  t: (key: string) => string,
): Readonly<Record<string, ProblemCopy>> {
  return {
    VALIDATION_FAILED: { title: t('problems.trackRange'), detail: t('problems.trackRangeDetail') },
    AIS_POSITION_NOT_FOUND: {
      title: t('problems.noPosition'),
      detail: t('problems.noPositionDetail'),
    },
  };
}
