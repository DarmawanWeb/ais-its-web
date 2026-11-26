/** Alert types raised by the surveillance detectors (contracts `ALERT_TYPES`, domain surveillance). */
export const SURVEILLANCE_TYPES = [
  'transhipment',
  'fishing',
  'dark',
  'anomaly',
  'geofence',
] as const;
export type SurveillanceType = (typeof SURVEILLANCE_TYPES)[number];

export function isSurveillanceType(value: unknown): value is SurveillanceType {
  return typeof value === 'string' && (SURVEILLANCE_TYPES as readonly string[]).includes(value);
}

/**
 * Chart colour of each type: fixed assignment (never cycled) from the design-system chart
 * tokens, in an order whose adjacent pairs stay apart for colour-vision deficiencies in both
 * themes (validated with the dataviz palette checks, order 1-8-2-7-6: worst adjacent ΔE ≈ 19). Stacked charts
 * stack the types in `SURVEILLANCE_TYPES` order; identity is never colour alone (legend,
 * tooltip and a table view carry the labels).
 */
export const TYPE_COLOR: Readonly<Record<SurveillanceType, string>> = {
  transhipment: 'var(--chart-1)',
  fishing: 'var(--chart-8)',
  dark: 'var(--chart-2)',
  anomaly: 'var(--chart-7)',
  geofence: 'var(--chart-6)',
};

/** Methodology catalog id of each detector's event (spec §17; events also carry `methodId`). */
export const TYPE_METHOD: Readonly<Record<SurveillanceType, string>> = {
  transhipment: 'transhipment.accuracy',
  fishing: 'fishing.loitering',
  dark: 'dark.ais_gap',
  anomaly: 'anomaly.navstatus_mismatch',
  geofence: 'geo.geofence_enter',
};

/** Page of each type (geofence events have no page of their own). */
export const TYPE_PATH: Readonly<Partial<Record<SurveillanceType, string>>> = {
  transhipment: '/surveillance/transhipment',
  fishing: '/surveillance/fishing',
  dark: '/surveillance/dark',
  anomaly: '/surveillance/anomaly',
};

/** Review statuses accepted by `PATCH /surveillance/events/:id` (`resolved` is set by detectors). */
export const REVIEW_STATUSES = ['open', 'confirmed', 'dismissed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type { SurveillanceEvent } from './dto';

/** `true` while the detector has not ended the occurrence. */
export function isActiveOccurrence(event: { resolvedAt: string | null }): boolean {
  return event.resolvedAt === null;
}
