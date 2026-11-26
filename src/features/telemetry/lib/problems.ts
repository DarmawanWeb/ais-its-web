import type { TFunction } from 'i18next';
import type { ProblemCopy } from '@/shared/api/problem-copy';

type Translate = TFunction;

/** Copies of the telemetry service's problem codes (handbook error table). */
export function telemetryProblemCopies(t: Translate): Readonly<Record<string, ProblemCopy>> {
  return Object.fromEntries(
    [
      'VALIDATION_FAILED',
      'FORBIDDEN',
      'ORGANIZATION_REQUIRED',
      'VESSEL_NOT_FOUND',
      'DEVICE_NOT_FOUND',
      'READING_CONFLICT',
    ].map((code) => [
      code,
      { title: t(`problems.${code}.title`), detail: t(`problems.${code}.detail`) },
    ]),
  );
}
