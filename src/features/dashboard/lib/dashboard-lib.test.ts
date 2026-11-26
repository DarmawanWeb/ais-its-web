import { describe, expect, it } from 'vitest';

import {
  alertTimeline,
  ewsCounts,
  fuelTotals,
  gradeShares,
  pushSample,
  rateSample,
  surveillanceRows,
} from './dashboard';

const NOW = Date.parse('2026-11-22T10:00:00Z');

describe('dashboard helpers', () => {
  it('buckets alerts per UTC day and severity, keeping empty days', () => {
    const rows = alertTimeline(
      [
        { occurredAt: '2026-11-22T08:00:00Z', severity: 'critical' },
        { occurredAt: '2026-11-22T01:00:00Z', severity: 'warning' },
        { occurredAt: '2026-11-16T23:59:00Z', severity: 'info' },
        { occurredAt: '2026-11-01T00:00:00Z', severity: 'critical' },
      ],
      NOW,
    );
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ day: '2026-11-16T00:00:00.000Z', info: 1, total: 1 });
    expect(rows[6]).toMatchObject({ critical: 1, warning: 1, total: 2 });
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(3);
  });

  it('counts EWS danger and warning vessels', () => {
    const counts = ewsCounts([
      { mmsi: 1, ewsStatus: 0, vessel: { id: 'a', name: 'KM A', typeCode: null } },
      { mmsi: 2, ewsStatus: 1, vessel: null },
      { mmsi: 3, ewsStatus: 3, vessel: null },
    ]);
    expect(counts).toEqual({ danger: 1, warning: 1, dangerVessels: [{ mmsi: 1, name: 'KM A' }] });
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

  it('shares grades and sums fuel of the month and year', () => {
    expect(gradeShares({ A: 1, B: 1, C: 2, D: 0, E: 0 })).toMatchObject({
      rated: 4,
      shares: { C: 0.5 },
    });
    expect(gradeShares({ A: 0, B: 0, C: 0, D: 0, E: 0 }).shares.A).toBe(0);
    expect(
      fuelTotals(
        [
          { day: '2026-11-02', fuelMeTon: 1, fuelAeTon: 0.5 },
          { day: '2026-10-31', fuelMeTon: 2, fuelAeTon: 0.5 },
          { day: '2025-12-31', fuelMeTon: 9, fuelAeTon: 9 },
        ],
        NOW,
      ),
    ).toEqual({ month: 1.5, year: 4 });
  });

  it('keeps a bounded, ordered rate history', () => {
    const stats = {
      activeVessels: 3,
      messagesLastMinute: 10,
      bySource: {
        primary: { activeVessels: 2, messagesLastMinute: 7 },
        batam: { activeVessels: 1, messagesLastMinute: 3 },
        pusher: { activeVessels: 0, messagesLastMinute: 0 },
      },
      activeWindowMinutes: 30,
      at: '2026-11-22T10:00:00Z',
    };
    let history = pushSample([], rateSample(stats, 2), 2);
    history = pushSample(history, rateSample(stats, 1), 2);
    history = pushSample(history, rateSample(stats, 3), 2);
    expect(history.map((sample) => sample.at)).toEqual([2, 3]);
    expect(history[0]).toMatchObject({ primary: 7, batam: 3, pusher: 0, total: 10 });
  });
});
