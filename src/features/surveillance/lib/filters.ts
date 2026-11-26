import type {
  EventsControllerListParams,
  EventsControllerListSeverity,
  EventsControllerListStatus,
} from '@/shared/api/generated/surveillance/model';

/** Time range presets of the surveillance pages (the API defaults to 30 days, max 366). */
export const RANGE_PRESETS = ['24h', '7d', '30d', '90d'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const RANGE_MS: Record<RangePreset, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
};

export const SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const satisfies readonly EventsControllerListSeverity[];
export const EVENT_STATUSES = [
  'open',
  'confirmed',
  'dismissed',
  'resolved',
] as const satisfies readonly EventsControllerListStatus[];

export interface EventFilters {
  range: RangePreset;
  severity: EventsControllerListSeverity | null;
  status: EventsControllerListStatus | null;
  /** 9-digit MMSI (also matches the related vessel of a pair). */
  mmsi: number | null;
}

export const DEFAULT_FILTERS: EventFilters = {
  range: '30d',
  severity: null,
  status: null,
  mmsi: null,
};

const MMSI_PATTERN = /^\d{9}$/;

/** Parses a typed MMSI; `null` when empty, `undefined` when invalid. */
export function parseMmsi(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return MMSI_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/** Reads the filters from the page URL (`?range=7d&severity=critical&status=open&mmsi=…`). */
export function filtersFromSearch(
  search: URLSearchParams,
  defaults = DEFAULT_FILTERS,
): EventFilters {
  const mmsi = parseMmsi(search.get('mmsi') ?? '');
  return {
    range: oneOf(RANGE_PRESETS, search.get('range')) ?? defaults.range,
    severity: oneOf(SEVERITIES, search.get('severity')) ?? defaults.severity,
    status: oneOf(EVENT_STATUSES, search.get('status')) ?? defaults.status,
    mmsi: mmsi ?? null,
  };
}

/** Writes the filters into URL parameters, leaving defaults (and unrelated parameters) out. */
export function filtersToSearch(
  filters: EventFilters,
  base: URLSearchParams = new URLSearchParams(),
  defaults = DEFAULT_FILTERS,
): URLSearchParams {
  const next = new URLSearchParams(base);
  const set = (key: string, value: string | null, fallback: string | null) => {
    if (value === null || value === fallback) next.delete(key);
    else next.set(key, value);
  };
  set('range', filters.range, defaults.range);
  set('severity', filters.severity, defaults.severity);
  set('status', filters.status, defaults.status);
  set('mmsi', filters.mmsi === null ? null : String(filters.mmsi), null);
  return next;
}

/** Start of a preset range, rounded down to the minute so query keys stay stable. */
export function rangeStart(range: RangePreset, now: number = Date.now()): string {
  const minute = Math.floor(now / 60_000) * 60_000;
  return new Date(minute - RANGE_MS[range]).toISOString();
}

export function rangeDurationMs(range: RangePreset): number {
  return RANGE_MS[range];
}

/** Query of `GET /surveillance/events` for a detector type and the page filters. */
export function eventQuery(
  type: string | undefined,
  filters: EventFilters,
  anchor: number,
  extra: Partial<EventsControllerListParams> = {},
): EventsControllerListParams {
  return {
    ...(type ? { type } : {}),
    from: rangeStart(filters.range, anchor),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.mmsi !== null ? { mmsi: filters.mmsi } : {}),
    ...extra,
  };
}

/** Number of filters that differ from the defaults (badge of the reset button). */
export function activeFilterCount(filters: EventFilters, defaults = DEFAULT_FILTERS): number {
  return (['range', 'severity', 'status', 'mmsi'] as const).filter(
    (key) => filters[key] !== defaults[key],
  ).length;
}
