import {
  ALERT_DOMAINS,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPE_LIST,
  type AlertDomain,
  type AlertSeverity,
  type AlertStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';

import type { AlertsControllerListParams } from '@/shared/api/generated/notification/model';

/** Filters of the alert inbox, mirrored in the URL (`?status=open&severity=critical…`). */
export interface AlertFilters {
  /** `all` = every status. */
  status: AlertStatus | 'all';
  severity: AlertSeverity | 'all';
  domain: AlertDomain | 'all';
  /** An alert type of the registry (or a future one) or `all`. */
  type: string;
  /** Vessel (MMSI of the vessel or of the related vessel); empty = any. */
  mmsi: string;
  /** ISO-8601 bounds of `occurredAt`. */
  from: string | null;
  to: string | null;
}

export const DEFAULT_ALERT_FILTERS: AlertFilters = {
  status: 'open',
  severity: 'all',
  domain: 'all',
  type: 'all',
  mmsi: '',
  from: null,
  to: null,
};

/** Page size of the inbox (cursor pages, spec §5). */
export const ALERT_PAGE_SIZE = 25;

const MMSI_PATTERN = /^\d{1,9}$/;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** Reads the filters from the query string; unknown values fall back to the defaults. */
export function filtersFromSearch(params: URLSearchParams): AlertFilters {
  const type = params.get('type');
  const mmsi = params.get('mmsi') ?? '';
  return {
    status: pick(params.get('status'), [...ALERT_STATUSES, 'all'] as const, 'open'),
    severity: pick(params.get('severity'), [...ALERT_SEVERITIES, 'all'] as const, 'all'),
    domain: pick(params.get('domain'), [...ALERT_DOMAINS, 'all'] as const, 'all'),
    type: type && /^[a-z][a-z0-9_]*$/.test(type) ? type : 'all',
    mmsi: MMSI_PATTERN.test(mmsi) ? mmsi : '',
    from: isoOrNull(params.get('from')),
    to: isoOrNull(params.get('to')),
  };
}

/** Writes the filters into a copy of `base` (defaults are omitted, other params are kept). */
export function filtersToSearch(filters: AlertFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const entries: [string, string | null][] = [
    ['status', filters.status === DEFAULT_ALERT_FILTERS.status ? null : filters.status],
    ['severity', filters.severity === 'all' ? null : filters.severity],
    ['domain', filters.domain === 'all' ? null : filters.domain],
    ['type', filters.type === 'all' ? null : filters.type],
    ['mmsi', filters.mmsi || null],
    ['from', filters.from],
    ['to', filters.to],
  ];
  for (const [key, value] of entries) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

/** Query parameters of `GET /api/v2/alerts` for the filters (without cursor). */
export function toListParams(
  filters: AlertFilters,
  limit = ALERT_PAGE_SIZE,
): AlertsControllerListParams {
  const params: AlertsControllerListParams = { limit };
  if (filters.status !== 'all') params.status = filters.status;
  if (filters.severity !== 'all') params.severity = filters.severity;
  if (filters.domain !== 'all') params.domain = filters.domain;
  if (filters.type !== 'all') params.type = filters.type;
  if (filters.mmsi && MMSI_PATTERN.test(filters.mmsi)) params.mmsi = Number(filters.mmsi);
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  return params;
}

/** Number of filters that differ from the defaults (badge of the filter button). */
export function activeFilterCount(filters: AlertFilters): number {
  let count = 0;
  if (filters.status !== DEFAULT_ALERT_FILTERS.status) count += 1;
  if (filters.severity !== 'all') count += 1;
  if (filters.domain !== 'all') count += 1;
  if (filters.type !== 'all') count += 1;
  if (filters.mmsi) count += 1;
  if (filters.from || filters.to) count += 1;
  return count;
}

/** Whether a realtime alert belongs to the current list (live insertion of `alert:raised`). */
export function matchesFilters(
  alert: Pick<
    RealtimeAlert,
    'status' | 'severity' | 'domain' | 'type' | 'mmsi' | 'relatedMmsi' | 'occurredAt'
  >,
  filters: AlertFilters,
): boolean {
  if (filters.status !== 'all' && alert.status !== filters.status) return false;
  if (filters.severity !== 'all' && alert.severity !== filters.severity) return false;
  if (filters.domain !== 'all' && alert.domain !== filters.domain) return false;
  if (filters.type !== 'all' && alert.type !== filters.type) return false;
  if (filters.mmsi) {
    const mmsi = Number(filters.mmsi);
    if (alert.mmsi !== mmsi && alert.relatedMmsi !== mmsi) return false;
  }
  const time = Date.parse(alert.occurredAt);
  if (filters.from && time < Date.parse(filters.from)) return false;
  if (filters.to && time > Date.parse(filters.to)) return false;
  return true;
}

/** Alert types offered by the type filter: the registry types of the selected domain. */
export function typeOptions(domain: AlertFilters['domain']): readonly string[] {
  return ALERT_TYPE_LIST.filter(
    (definition) => domain === 'all' || definition.domain === domain,
  ).map((definition) => definition.type);
}
