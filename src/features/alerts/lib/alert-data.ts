/**
 * Detector specific `data` of an alert (open shape: distances, thresholds, CPA/TCPA, …),
 * turned into typed entries that the UI renders as text — never as HTML.
 */
export type DataEntryKind =
  | 'meters'
  | 'nauticalMiles'
  | 'minutes'
  | 'knots'
  | 'ewsStatus'
  | 'collisionRisk'
  | 'mmsi'
  | 'time'
  | 'number'
  | 'boolean'
  | 'text'
  | 'json'
  | 'empty';

export interface DataEntry {
  key: string;
  kind: DataEntryKind;
  value: unknown;
  /** `kind === 'json'`: pretty-printed, clipped text. */
  text?: string;
}

/** Keys with a known meaning (translated label, unit). Order = display order. */
export const KNOWN_DATA_KEYS: Readonly<Record<string, DataEntryKind>> = {
  ewsStatus: 'ewsStatus',
  pipelineDistanceM: 'meters',
  distanceM: 'meters',
  risk: 'collisionRisk',
  cpaNm: 'nauticalMiles',
  tcpaMin: 'minutes',
  rangeNm: 'nauticalMiles',
  sog: 'knots',
  sogKn: 'knots',
  relatedMmsi: 'mmsi',
  otherMmsi: 'mmsi',
  gapMinutes: 'minutes',
  accuracy: 'number',
  thresholds: 'json',
};

/** Keys shown elsewhere in the detail (method, zone): not repeated in the data list. */
const HIDDEN_KEYS = new Set(['methodId', 'zoneId', 'encounterId']);

const MAX_JSON_LENGTH = 4_000;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function jsonText(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > MAX_JSON_LENGTH ? `${text.slice(0, MAX_JSON_LENGTH)}…` : text;
}

function kindOf(key: string, value: unknown): DataEntryKind {
  if (value === null || value === undefined || value === '') return 'empty';
  const known = KNOWN_DATA_KEYS[key];
  if (known === 'json') return 'json';
  if (known && (typeof value === 'number' || typeof value === 'string')) {
    if (known === 'collisionRisk' || known === 'ewsStatus' || known === 'mmsi') return known;
    if (typeof value === 'number' && Number.isFinite(value)) return known;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return ISO_TIME.test(value) ? 'time' : 'text';
  return 'json';
}

/** Typed entries of `data`: known keys first (in their order), then the others by key. */
export function dataEntries(
  data: Readonly<Record<string, unknown>> | null | undefined,
): DataEntry[] {
  if (!data || typeof data !== 'object') return [];
  const order = Object.keys(KNOWN_DATA_KEYS);
  return Object.entries(data)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    })
    .map(([key, value]) => {
      const kind = kindOf(key, value);
      return kind === 'json' ? { key, kind, value, text: jsonText(value) } : { key, kind, value };
    });
}
