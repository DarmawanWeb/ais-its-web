import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  getAlertsControllerGetQueryKey,
  getAlertsControllerListQueryKey,
} from '@/shared/api/generated/notification/alerts/alerts';
import type { AlertDto, AlertPageDto } from '@/shared/api/generated/notification/model';

import {
  alertFromRealtime,
  findCachedAlert,
  patchAlertCaches,
  prependToPage,
  restoreAlertCaches,
  snapshotAlertCaches,
} from './alert-cache';
import { csvDataRows, exportFileName } from './alert-csv';
import { dataEntries } from './alert-data';
import {
  activeFilterCount,
  DEFAULT_ALERT_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  matchesFilters,
  toListParams,
  typeOptions,
} from './alert-filters';
import { ALERT } from '../test/fixtures';
import { badgeCount, shortId } from './format';

const realtimeOf = (alert: AlertDto): RealtimeAlert => ({
  id: alert.id,
  type: alert.type,
  domain: alert.domain,
  severity: alert.severity,
  status: alert.status,
  mmsi: alert.mmsi,
  relatedMmsi: alert.relatedMmsi,
  title: alert.title,
  message: alert.message,
  lat: alert.lat,
  lon: alert.lon,
  zoneId: alert.zoneId,
  methodId: alert.methodId,
  occurredAt: alert.occurredAt,
  lastOccurredAt: alert.lastOccurredAt,
  occurrences: alert.occurrences,
  data: alert.data,
});

describe('alert filters', () => {
  it('reads valid values from the URL and falls back to the defaults', () => {
    const filters = filtersFromSearch(
      new URLSearchParams(
        'status=resolved&severity=critical&domain=safety&type=ews&mmsi=525005223&from=2026-11-01T00:00:00.000Z',
      ),
    );
    expect(filters).toEqual({
      status: 'resolved',
      severity: 'critical',
      domain: 'safety',
      type: 'ews',
      mmsi: '525005223',
      from: '2026-11-01T00:00:00.000Z',
      to: null,
    });
    expect(
      filtersFromSearch(
        new URLSearchParams('status=bogus&severity=x&mmsi=abc&type=BAD-TYPE&from=nope'),
      ),
    ).toEqual(DEFAULT_ALERT_FILTERS);
  });

  it('writes only what differs from the defaults and keeps other params', () => {
    const next = filtersToSearch(
      { ...DEFAULT_ALERT_FILTERS, severity: 'warning' },
      new URLSearchParams('alert=x&status=all'),
    );
    expect(next.get('alert')).toBe('x');
    expect(next.get('status')).toBeNull();
    expect(next.get('severity')).toBe('warning');
  });

  it('builds the list query and counts the active filters', () => {
    const filters = {
      ...DEFAULT_ALERT_FILTERS,
      status: 'all' as const,
      mmsi: '525005223',
      type: 'collision',
    };
    expect(toListParams(filters, 10)).toEqual({ limit: 10, type: 'collision', mmsi: 525005223 });
    expect(activeFilterCount(filters)).toBe(3);
    expect(activeFilterCount(DEFAULT_ALERT_FILTERS)).toBe(0);
  });

  it('matches realtime alerts against the filters (vessel or related vessel, time range)', () => {
    const alert = realtimeOf({ ...ALERT, relatedMmsi: 563012345 });
    expect(matchesFilters(alert, DEFAULT_ALERT_FILTERS)).toBe(true);
    expect(matchesFilters(alert, { ...DEFAULT_ALERT_FILTERS, mmsi: '563012345' })).toBe(true);
    expect(matchesFilters(alert, { ...DEFAULT_ALERT_FILTERS, severity: 'info' })).toBe(false);
    expect(matchesFilters(alert, { ...DEFAULT_ALERT_FILTERS, status: 'acknowledged' })).toBe(false);
    expect(
      matchesFilters(alert, { ...DEFAULT_ALERT_FILTERS, from: '2026-11-23T00:00:00.000Z' }),
    ).toBe(false);
  });

  it('offers the registry types of the selected domain', () => {
    expect(typeOptions('safety')).toEqual(['ews', 'collision']);
    expect(typeOptions('all')).toContain('transhipment');
  });
});

describe('alert caches', () => {
  const listKey = getAlertsControllerListQueryKey({ limit: 25, status: 'open' });

  it('patches lists and detail, snapshots and restores them', () => {
    const client = new QueryClient();
    client.setQueryData<AlertPageDto>(listKey, {
      data: [ALERT],
      page: { nextCursor: null, limit: 25 },
    });
    client.setQueryData<AlertDto>(getAlertsControllerGetQueryKey(ALERT.id), ALERT);
    const snapshot = snapshotAlertCaches(client, ALERT.id);

    patchAlertCaches(client, { id: ALERT.id, status: 'acknowledged' });
    expect(client.getQueryData<AlertPageDto>(listKey)?.data[0]?.status).toBe('acknowledged');
    expect(findCachedAlert(client, ALERT.id)?.status).toBe('acknowledged');

    restoreAlertCaches(client, snapshot);
    expect(client.getQueryData<AlertPageDto>(listKey)?.data[0]?.status).toBe('open');
    expect(client.getQueryData<AlertDto>(getAlertsControllerGetQueryKey(ALERT.id))?.status).toBe(
      'open',
    );
  });

  it('turns a realtime alert into an AlertDto, keeping what the push does not carry', () => {
    const dto = alertFromRealtime({ ...realtimeOf(ALERT), status: 'acknowledged' }, ALERT);
    expect(dto.dedupKey).toBe(ALERT.dedupKey);
    expect(dto.orgId).toBe(ALERT.orgId);
    expect(dto.status).toBe('acknowledged');
    expect(dto.acknowledgedAt).toBe(ALERT.lastOccurredAt);
    expect(alertFromRealtime(realtimeOf(ALERT)).source).toBe('safety');
  });

  it('prepends to a page without duplicates and keeps its size', () => {
    const other = { ...ALERT, id: 'other' };
    const page: AlertPageDto = { data: [other, ALERT], page: { nextCursor: 'c', limit: 2 } };
    const next = prependToPage(page, { ...ALERT, title: 'new' }, 2);
    expect(next?.data.map((a) => a.id)).toEqual([ALERT.id, 'other']);
    expect(next?.data[0]?.title).toBe('new');
    expect(prependToPage(undefined, ALERT, 2)).toBeUndefined();
  });
});

describe('detector data', () => {
  it('types known keys, hides the shown ones and pretty-prints objects', () => {
    const entries = dataEntries({
      zz: 'x',
      methodId: 'hidden',
      thresholds: { dangerM: 500 },
      pipelineDistanceM: 102.6,
      ewsStatus: 0,
      seenAt: '2026-11-22T10:00:00.000Z',
      ok: true,
      empty: null,
    });
    expect(entries.map((e) => [e.key, e.kind])).toEqual([
      ['ewsStatus', 'ewsStatus'],
      ['pipelineDistanceM', 'meters'],
      ['thresholds', 'json'],
      ['empty', 'empty'],
      ['ok', 'boolean'],
      ['seenAt', 'time'],
      ['zz', 'text'],
    ]);
    expect(entries.find((e) => e.key === 'thresholds')?.text).toContain('"dangerM": 500');
    expect(dataEntries(null)).toEqual([]);
  });
});

describe('CSV export', () => {
  it('counts the data rows of the service export and names the fallback file', () => {
    expect(csvDataRows('ID,Judul\r\n1,"Bahaya\r\ndekat pipa"\r\n2,Kapal\r\n')).toBe(2);
    expect(csvDataRows('ID,Judul\r\n')).toBe(0);
    expect(csvDataRows('')).toBe(0);
    expect(exportFileName(new Date(2026, 10, 22, 9, 5))).toBe('alerts-20261122-0905.csv');
  });
});

describe('format helpers', () => {
  it('caps badge counts and shortens ids', () => {
    expect(badgeCount(7)).toBe('7');
    expect(badgeCount(120)).toBe('99+');
    expect(shortId('0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a')).toBe('0192f0c8…5b6a');
  });
});
