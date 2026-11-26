import type { ApiProblem } from '@/shared/api/problem';

/** Form fields of the zone editor a server problem can point at. */
export type ZoneFormField =
  'code' | 'name' | 'kind' | 'bufferM' | 'source' | 'geometry' | 'properties';

/** A friendly, translated explanation of a geo service problem (`zones:problems.<key>`). */
export interface ZoneProblemMessage {
  /** i18n key under `zones:problems`. */
  key: string;
  params: Record<string, string | number>;
  /** The form field the problem belongs to (shown next to it), if any. */
  field?: ZoneFormField;
  /** Conflict that needs the reload/overwrite dialog instead of a message. */
  conflict?: boolean;
}

const FIELD_OF_PATH: [RegExp, ZoneFormField][] = [
  [/^code/, 'code'],
  [/^name/, 'name'],
  [/^kind/, 'kind'],
  [/^bufferM/, 'bufferM'],
  [/^source/, 'source'],
  [/^geometry/, 'geometry'],
  [/^properties/, 'properties'],
];

/** Form field of a `VALIDATION_FAILED` error path (`geometry.coordinates.0` → geometry). */
export function fieldOfPath(path: string): ZoneFormField | undefined {
  return FIELD_OF_PATH.find(([pattern]) => pattern.test(path))?.[1];
}

const num = (value: unknown) => (typeof value === 'number' ? value : Number(value));

/**
 * Maps the geo service's problem codes (geo README, validation steps and "other problem codes")
 * to friendly messages and the form field they concern.
 */
export function zoneProblemMessage(problem: ApiProblem): ZoneProblemMessage {
  const ext = problem.extensions;
  const detail = problem.detail ?? '';
  switch (problem.code) {
    case 'ZONE_GEOMETRY_TYPE_NOT_ALLOWED':
      return { key: 'typeNotAllowed', params: { detail }, field: 'geometry' };
    case 'ZONE_GEOMETRY_TOO_COMPLEX':
      return { key: 'tooComplex', params: { detail }, field: 'geometry' };
    case 'ZONE_BUFFER_REQUIRED':
      return { key: 'bufferRequired', params: {}, field: 'bufferM' };
    case 'ZONE_GEOMETRY_CROSSES_ANTIMERIDIAN':
      return { key: 'antimeridian', params: { detail }, field: 'geometry' };
    case 'ZONE_GEOMETRY_INVALID':
      return { key: 'invalid', params: { detail: detail || problem.title }, field: 'geometry' };
    case 'ZONE_VERSION_CONFLICT':
      return { key: 'conflict', params: {}, conflict: true };
    case 'ZONE_QUOTA_EXCEEDED':
      return {
        key: ext.resource === 'vertices' ? 'quotaVertices' : 'quotaZones',
        params: {
          used: num(ext.used ?? 0),
          requested: num(ext.requested ?? 0),
          limit: num(ext.limit ?? 0),
        },
      };
    case 'ZONE_CODE_TAKEN':
      return { key: 'codeTaken', params: {}, field: 'code' };
    case 'ZONE_SNAPSHOT_TOO_LARGE':
      return {
        key: 'snapshotTooLarge',
        params: {
          size: Math.round(num(ext.snapshotBytes ?? 0) / 1024),
          max: Math.round(num(ext.maxBytes ?? 0) / 1024),
        },
        field: 'geometry',
      };
    case 'ZONE_NOT_FOUND':
      return { key: 'notFound', params: {} };
    case 'GLOBAL_ZONE_WRITE_FORBIDDEN':
      return { key: 'globalForbidden', params: {} };
    case 'ZONE_WRITE_FORBIDDEN':
      return { key: 'writeForbidden', params: {} };
    case 'ORGANIZATION_REQUIRED':
      return { key: 'organizationRequired', params: {} };
    case 'VALIDATION_FAILED': {
      const first = problem.errors[0];
      const field = first ? fieldOfPath(first.field) : undefined;
      return {
        key: 'validation',
        params: { detail: first ? `${first.field}: ${first.message}` : detail },
        ...(field ? { field } : {}),
      };
    }
    default:
      if (problem.status === 403) return { key: 'forbidden', params: {} };
      if (problem.status === 413) return { key: 'payloadTooLarge', params: {} };
      return { key: 'generic', params: { detail: detail || problem.title } };
  }
}

/** The stored version reported by `412 ZONE_VERSION_CONFLICT` (`currentEtag`), if any. */
export function currentEtagOf(problem: ApiProblem): string | null {
  const value = problem.extensions.currentEtag;
  return typeof value === 'string' && value !== '' ? value : null;
}
