import type { TFunction } from 'i18next';
import type { ProblemCopy } from '@/shared/api/problem-copy';

type Translate = TFunction;

/** Copies of the fleet service's problem codes (handbook "Error codes"). */
export function fleetProblemCopies(t: Translate): Readonly<Record<string, ProblemCopy>> {
  const copy = (code: string): ProblemCopy => ({
    title: t(`problems.${code}.title`),
    detail: t(`problems.${code}.detail`),
  });
  return Object.fromEntries(
    [
      'VALIDATION_FAILED',
      'FORBIDDEN',
      'ORGANIZATION_REQUIRED',
      'PLATFORM_ADMIN_REQUIRED',
      'VESSEL_NOT_FOUND',
      'REGISTRY_ENTRY_NOT_FOUND',
      'PHOTO_NOT_FOUND',
      'MMSI_ALREADY_EXISTS',
      'IMO_ALREADY_EXISTS',
      'REFERENCE_IN_USE',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
    ].map((code) => [code, copy(code)]),
  );
}

/** Copies of photo uploads: `503 SERVICE_UNAVAILABLE` means the object storage there. */
export function photoProblemCopies(t: Translate): Readonly<Record<string, ProblemCopy>> {
  return {
    ...fleetProblemCopies(t),
    SERVICE_UNAVAILABLE: {
      title: t('problems.SERVICE_UNAVAILABLE.title'),
      detail: t('problems.SERVICE_UNAVAILABLE.detail'),
    },
  };
}

/** Problem codes that point at one form field (the API sends no `errors[]` for them). */
export const FIELD_OF_CONFLICT: Readonly<Record<string, string>> = {
  MMSI_ALREADY_EXISTS: 'mmsi',
  IMO_ALREADY_EXISTS: 'imo',
};
