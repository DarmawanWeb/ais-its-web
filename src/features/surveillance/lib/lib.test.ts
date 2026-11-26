import { describe, expect, it, vi } from 'vitest';

import type { PairTrackDto } from '@/shared/api/generated/ais-processor/model';

import {
  darkGapMinutes,
  durationParts,
  readAnomalyData,
  readDarkData,
  readResolutionReason,
  readTranshipmentData,
  resolutionReasonKey,
  supersededBy,
} from './event-data';
import { collectCursorPages, collectPages, exportFileName, toCsvRows } from './export';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  eventQuery,
  filtersFromSearch,
  filtersToSearch,
  parseMmsi,
  rangeStart,
} from './filters';
import { bboxOf, heatmapCellKm, snapBBox, withPosition } from './geo';
import {
  closestApproach,
  distanceM,
  pairDistanceAt,
  positionAt,
  prepareReplay,
  replayWindow,
} from './replay';
import { buildBuckets, isDailyBucket } from './time-buckets';
import { isSurveillanceType, SURVEILLANCE_TYPES, TYPE_COLOR, TYPE_METHOD } from './types';

describe('types', () => {
  it('gives every type a fixed colour and method', () => {
    for (const type of SURVEILLANCE_TYPES) {
      expect(TYPE_COLOR[type]).toMatch(/^var\(--chart-\d\)$/);
      expect(TYPE_METHOD[type]).toMatch(/\./);
    }
    expect(new Set(Object.values(TYPE_COLOR)).size).toBe(SURVEILLANCE_TYPES.length);
    expect(isSurveillanceType('dark')).toBe(true);
    expect(isSurveillanceType('ews')).toBe(false);
  });
});

describe('event data readers', () => {
  it('reads transhipment data and drops invalid values', () => {
    const data = readTranshipmentData({
      accuracy: 86.5,
      averagePriority: 'high',
      priorityDistribution: { low: 10, medium: 30, high: 60 },
      lastDistanceM: null,
    });
    expect(data.accuracy).toBe(86.5);
    expect(data.averagePriority).toBeUndefined();
    expect(data.priorityDistribution).toEqual({ low: 10, medium: 30, high: 60 });
    expect(data.lastDistanceM).toBeNull();
  });

  it('accepts missing data', () => {
    expect(readAnomalyData(undefined)).toEqual({});
    expect(readAnomalyData({ predictedNavstatus: 3, streak: 4 })).toEqual({
      predictedNavstatus: undefined,
      streak: 4,
    });
    expect(readDarkData(null)).toEqual({});
    expect(readResolutionReason({ reason: 'AIS reports resumed' })).toBe('AIS reports resumed');
    expect(readResolutionReason(null)).toBeNull();
  });

  it("maps the detectors' resolution reasons to translation keys", () => {
    expect(resolutionReasonKey('AIS reports resumed')).toBe('aisResumed');
    expect(resolutionReasonKey('escalated')).toBe('escalated');
    expect(resolutionReasonKey('zone no longer alerts on entry')).toBe('zoneNoLongerAlerts');
    expect(resolutionReasonKey('something new')).toBeNull();
    expect(resolutionReasonKey(null)).toBeNull();
    expect(supersededBy({ reason: 'escalated', supersededBy: 'evt-2' })).toBe('evt-2');
    expect(supersededBy({ reason: 'left the zone' })).toBeNull();
    expect(supersededBy(null)).toBeNull();
  });

  it('measures dark gaps: growing while open, resolved gap once reappeared', () => {
    const lastSeenAt = '2026-11-20T10:00:00.000Z';
    const open = { data: { lastSeenAt, gapMin: 31 }, resolution: null, resolvedAt: null };
    expect(darkGapMinutes(open, new Date('2026-11-20T12:30:00.000Z'))).toBe(150);
    const resolved = {
      data: { lastSeenAt, gapMin: 31 },
      resolution: { gapMin: 95, reappearedAt: '2026-11-20T11:35:00.000Z' },
      resolvedAt: '2026-11-20T11:35:00.000Z',
    };
    expect(darkGapMinutes(resolved)).toBe(95);
    const resolvedWithoutGap = {
      ...resolved,
      resolution: { gapMin: null, reappearedAt: '2026-11-20T11:00:00.000Z' },
    };
    expect(darkGapMinutes(resolvedWithoutGap)).toBe(60);
    expect(darkGapMinutes({ data: {}, resolution: null, resolvedAt: null })).toBeUndefined();
  });

  it('splits durations', () => {
    expect(durationParts(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(durationParts(1505)).toEqual({ days: 1, hours: 1, minutes: 5 });
    expect(durationParts(59.6)).toEqual({ days: 0, hours: 1, minutes: 0 });
  });
});

describe('filters', () => {
  it('round-trips through the URL and ignores invalid values', () => {
    const search = new URLSearchParams(
      'range=7d&severity=critical&status=bogus&mmsi=525005223&tab=x',
    );
    const filters = filtersFromSearch(search);
    expect(filters).toEqual({ range: '7d', severity: 'critical', status: null, mmsi: 525005223 });
    const next = filtersToSearch({ ...filters, range: '30d' }, search);
    expect(next.get('range')).toBeNull();
    expect(next.get('severity')).toBe('critical');
    expect(next.get('tab')).toBe('x');
    expect(activeFilterCount(filters)).toBe(3);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('parses MMSIs', () => {
    expect(parseMmsi('')).toBeNull();
    expect(parseMmsi(' 525005223 ')).toBe(525005223);
    expect(parseMmsi('52500')).toBeUndefined();
  });

  it('builds the events query with a stable start', () => {
    const anchor = Date.parse('2026-11-22T10:15:42.123Z');
    expect(rangeStart('24h', anchor)).toBe('2026-11-21T10:15:00.000Z');
    expect(
      eventQuery('dark', { ...DEFAULT_FILTERS, severity: 'warning' }, anchor, { limit: 50 }),
    ).toEqual({
      type: 'dark',
      from: '2026-10-23T10:15:00.000Z',
      severity: 'warning',
      limit: 50,
    });
  });
});

describe('time buckets', () => {
  it('covers a week with daily buckets', () => {
    const from = new Date('2026-11-15T10:00:00.000Z');
    const to = new Date('2026-11-22T10:00:00.000Z');
    const buckets = buildBuckets(from, to, 8);
    expect(buckets.length).toBeLessThanOrEqual(8);
    expect(buckets[0]?.from).toBe(from.toISOString());
    expect(buckets.at(-1)?.to).toBe(to.toISOString());
    expect(buckets[1]?.from).toBe('2026-11-16T00:00:00.000Z');
    expect(isDailyBucket(buckets[0]!)).toBe(true);
    for (let i = 1; i < buckets.length; i += 1) expect(buckets[i]?.from).toBe(buckets[i - 1]?.to);
  });

  it('uses hours for a day and stays within the cap', () => {
    const to = new Date('2026-11-22T10:30:00.000Z');
    const buckets = buildBuckets(new Date(to.getTime() - 86_400_000), to, 12);
    expect(buckets.length).toBeLessThanOrEqual(12);
    expect(isDailyBucket(buckets[0]!)).toBe(false);
    expect(buildBuckets(to, to)).toEqual([]);
  });
});

describe('geo helpers', () => {
  it('keeps positioned items and boxes them', () => {
    const items = withPosition([
      { id: 1, lat: 1.1, lon: 103.9 },
      { id: 2, lat: null, lon: 104 },
    ]);
    expect(items.map((item) => item.id)).toEqual([1]);
    const bbox = bboxOf([[103.9, 1.1]]);
    expect(bbox?.[0]).toBeCloseTo(103.75);
    expect(bbox?.[3]).toBeCloseTo(1.25);
    expect(bboxOf([])).toBeNull();
  });

  it('picks nice heatmap cells and snaps boxes', () => {
    expect(heatmapCellKm(null)).toBe(10);
    expect(heatmapCellKm([95, -11, 141, 6])).toBe(200);
    expect(heatmapCellKm([103.7, 1, 104.1, 1.3])).toBe(2);
    expect(snapBBox([103.71, 1.02, 104.12, 1.31])).toEqual([103.5, 1, 104.5, 1.5]);
  });
});

describe('pair track replay', () => {
  const pair: PairTrackDto = {
    from: '2026-11-20T10:00:00.000Z',
    to: '2026-11-20T11:00:00.000Z',
    tracks: [
      {
        mmsi: 525005223,
        from: '2026-11-20T10:00:00.000Z',
        to: '2026-11-20T11:00:00.000Z',
        resolution: 'raw',
        simplifyM: null,
        truncated: false,
        remainingTo: null,
        points: [
          {
            time: '2026-11-20T10:10:00.000Z',
            lat: 1,
            lon: 104.01,
            sog: 1,
            cog: 0,
            hdg: 0,
            navstatus: 0,
            predictedNavstatus: 0,
            source: 'batam',
          },
          {
            time: '2026-11-20T10:00:00.000Z',
            lat: 1,
            lon: 104,
            sog: 2,
            cog: 0,
            hdg: 0,
            navstatus: 0,
            predictedNavstatus: 0,
            source: 'batam',
          },
        ],
      },
      {
        mmsi: 525019001,
        from: '2026-11-20T10:00:00.000Z',
        to: '2026-11-20T11:00:00.000Z',
        resolution: 'raw',
        simplifyM: null,
        truncated: false,
        remainingTo: null,
        points: [
          {
            time: '2026-11-20T10:00:00.000Z',
            lat: 1.01,
            lon: 104,
            sog: 1,
            cog: 0,
            hdg: 0,
            navstatus: 0,
            predictedNavstatus: 0,
            source: 'batam',
          },
          {
            time: '2026-11-20T10:10:00.000Z',
            lat: 1,
            lon: 104.01,
            sog: 1,
            cog: 0,
            hdg: 0,
            navstatus: 0,
            predictedNavstatus: 0,
            source: 'batam',
          },
        ],
      },
    ],
  };

  it('sorts tracks and interpolates positions', () => {
    const replay = prepareReplay(pair)!;
    expect(replay.start).toBe(Date.parse('2026-11-20T10:00:00.000Z'));
    expect(replay.end).toBe(Date.parse('2026-11-20T10:10:00.000Z'));
    const mid = positionAt(replay.tracks[0]!, Date.parse('2026-11-20T10:05:00.000Z'));
    expect(mid?.[0]).toBeCloseTo(104.005);
    expect(positionAt(replay.tracks[0]!, replay.end + 1)).toBeNull();
    expect(prepareReplay(undefined)).toBeNull();
  });

  it('measures the pair distance and its closest approach', () => {
    const replay = prepareReplay(pair)!;
    expect(pairDistanceAt(replay, replay.start)).toBeCloseTo(distanceM([104, 1], [104, 1.01]), 3);
    expect(distanceM([104, 1], [104, 1.01])).toBeCloseTo(1112, -1);
    const closest = closestApproach(replay, 60_000);
    expect(closest?.distanceM).toBeLessThan(1);
    expect(replayWindow('2026-11-20T10:00:00.000Z', '2026-11-20T10:30:00.000Z', 600_000)).toEqual({
      from: '2026-11-20T09:50:00.000Z',
      to: '2026-11-20T10:40:00.000Z',
    });
  });
});

describe('exports', () => {
  it('maps rows by header', () => {
    expect(
      toCsvRows(
        [{ a: 1, b: null }],
        [
          { header: 'A', value: (row) => row.a },
          { header: 'B', value: (row) => row.b },
        ],
      ),
    ).toEqual([{ A: 1, B: '' }]);
    expect(exportFileName('dark', new Date('2026-11-22T01:00:00Z'))).toBe('dark-2026-11-22.csv');
  });

  it('follows cursors up to the cap', async () => {
    const fetchPage = vi.fn((cursor: string | undefined) =>
      Promise.resolve(
        cursor === undefined
          ? { data: [1, 2], page: { nextCursor: 'c2' } }
          : { data: [3], page: { nextCursor: null } },
      ),
    );
    expect(await collectCursorPages(fetchPage)).toEqual({ items: [1, 2, 3], truncated: false });
    expect(await collectCursorPages(fetchPage, 2)).toEqual({ items: [1, 2], truncated: true });
    // Exactly the cap and no further page: complete, not truncated.
    expect(await collectCursorPages(fetchPage, 3)).toEqual({ items: [1, 2, 3], truncated: false });
  });

  it('collects page-based lists', async () => {
    const fetchPage = vi.fn((page: number) =>
      Promise.resolve({
        data: page === 1 ? ['a', 'b'] : page === 2 ? ['c'] : [],
        meta: { total: 3, pageSize: 2 },
      }),
    );
    expect(await collectPages(fetchPage)).toEqual({ items: ['a', 'b', 'c'], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('series', () => {
  it('builds rows per bucket and totals per type', async () => {
    const { buildSeries, totalsByType, share } = await import('./series');
    const buckets = [
      { from: '2026-11-20T00:00:00.000Z', to: '2026-11-21T00:00:00.000Z', sizeMs: 86_400_000 },
      { from: '2026-11-21T00:00:00.000Z', to: '2026-11-22T00:00:00.000Z', sizeMs: 86_400_000 },
    ];
    const rows = buildSeries(buckets, [
      { byType: { dark: 2, transhipment: 1, ews: 9 } },
      undefined,
    ]);
    expect(rows[0]).toMatchObject({ dark: 2, transhipment: 1, fishing: 0, total: 3, loaded: true });
    expect(rows[1]).toMatchObject({ total: 0, loaded: false });
    expect(totalsByType(rows).dark).toBe(2);
    expect(share(1, 4)).toBe(25);
    expect(share(1, 0)).toBe(0);
  });
});
