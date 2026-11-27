import { describe, expect, it } from 'vitest';

import { alertSeriesRows, gradeShares, rateSeries, surveillanceRows } from './dashboard';

describe('dashboard helpers', () => {
  it('maps alert series buckets to chart rows, missing keys as zero', () => {
    const rows = alertSeriesRows({
      buckets: [
        {
          from: '2026-11-21T17:00:00.000Z',
          to: '2026-11-22T17:00:00.000Z',
          total: 3,
          counts: { info: 1, warning: 0, critical: 2 },
        },
        {
          from: '2026-11-22T17:00:00.000Z',
          to: '2026-11-23T17:00:00.000Z',
          total: 1,
          counts: { warning: 1 },
        },
      ],
    });
    expect(rows).toEqual([
      { day: '2026-11-21T17:00:00.000Z', info: 1, warning: 0, critical: 2, total: 3 },
      { day: '2026-11-22T17:00:00.000Z', info: 0, warning: 1, critical: 0, total: 1 },
    ]);
  });

  it('orders surveillance types with zeros and keeps unknown ones', () => {
    expect(surveillanceRows({ dark: 2, spoofing: 1 })).toEqual([
      { type: 'transhipment', count: 0 },
      { type: 'fishing', count: 0 },
      { type: 'dark', count: 2 },
      { type: 'anomaly', count: 0 },
      { type: 'geofence', count: 0 },
      { type: 'spoofing', count: 1 },
    ]);
  });

  it('shares grades', () => {
    expect(gradeShares({ A: 1, B: 1, C: 2, D: 0, E: 0 })).toMatchObject({
      rated: 4,
      shares: { C: 0.5 },
    });
    expect(gradeShares({ A: 0, B: 0, C: 0, D: 0, E: 0 }).shares.A).toBe(0);
  });

  it('turns traffic buckets into messages per minute, skipping unsampled buckets', () => {
    const feed = (messages: number) => ({ messages, activeVessels: 1 });
    const samples = rateSeries({
      points: [
        {
          at: '2026-11-22T10:00:00.000Z',
          samples: 5,
          messages: 640,
          activeVessels: 14,
          bySource: { primary: feed(420), batam: feed(220), pusher: feed(0) },
        },
        {
          at: '2026-11-22T10:05:00.000Z',
          samples: 0,
          messages: 0,
          activeVessels: 0,
          bySource: { primary: feed(0), batam: feed(0), pusher: feed(0) },
        },
        {
          at: '2026-11-22T10:10:00.000Z',
          samples: 2,
          messages: 257,
          activeVessels: 14,
          bySource: { primary: feed(170), batam: feed(87), pusher: feed(0) },
        },
      ],
    });
    expect(samples).toEqual([
      { at: Date.parse('2026-11-22T10:00:00Z'), primary: 84, batam: 44, pusher: 0, total: 128 },
      { at: Date.parse('2026-11-22T10:10:00Z'), primary: 85, batam: 43.5, pusher: 0, total: 128.5 },
    ]);
  });
});
