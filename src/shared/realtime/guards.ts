import type { CiiUpdatedV1 } from '@darmawanweb/ais-its-contracts/events';
import type {
  RealtimePosition,
  RealtimeSafetyState,
} from '@darmawanweb/ais-its-contracts/realtime';

/*
 * Cheap structural guards for the high-volume realtime messages (thousands of items per
 * second): full zod parsing is reserved for the low-volume events (alerts, CII).
 */
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validLatLon(lat: unknown, lon: unknown): boolean {
  return finite(lat) && finite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function isRealtimePosition(value: unknown): value is RealtimePosition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return finite(v.mmsi) && typeof v.time === 'string' && validLatLon(v.lat, v.lon);
}

export function isRealtimeSafetyState(value: unknown): value is RealtimeSafetyState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    finite(v.mmsi) &&
    typeof v.time === 'string' &&
    validLatLon(v.lat, v.lon) &&
    (v.ewsStatus === 0 || v.ewsStatus === 1 || v.ewsStatus === 3) &&
    typeof v.collisionRisk === 'string'
  );
}

export function batchItems<T>(batch: unknown, guard: (value: unknown) => value is T): T[] {
  const items = (batch as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.filter(guard) : [];
}

const CII_GRADES = new Set(['A', 'B', 'C', 'D', 'E']);

/** Structural check of `cii:updated` (keeps the events catalog out of the main bundle). */
export function isCiiUpdate(value: unknown): value is CiiUpdatedV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    finite(v.mmsi) &&
    finite(v.year) &&
    finite(v.attained) &&
    finite(v.required) &&
    finite(v.rating) &&
    typeof v.grade === 'string' &&
    CII_GRADES.has(v.grade)
  );
}
