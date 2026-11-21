import type {
  RealtimePosition,
  RealtimeSafetyState,
} from '@darmawanweb/ais-its-contracts/realtime';
import { describe, expect, it, vi } from 'vitest';

import { batchItems, isCiiUpdate, isRealtimePosition, isRealtimeSafetyState } from './guards';
import { inBBox, VesselLiveStore } from './vessel-store';

const T0 = Date.parse('2026-11-21T08:00:00Z');
const iso = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

function position(
  mmsi: number,
  offsetSeconds: number,
  lat = 1.14,
  lon = 103.85,
  extra: Partial<RealtimePosition> = {},
): RealtimePosition {
  return {
    mmsi,
    time: iso(offsetSeconds),
    lat,
    lon,
    sog: 10,
    cog: 90,
    hdg: 92,
    navstatus: 0,
    predictedNavstatus: 0,
    source: 'primary',
    ...extra,
  };
}

function safety(
  mmsi: number,
  offsetSeconds: number,
  extra: Partial<RealtimeSafetyState> = {},
): RealtimeSafetyState {
  return {
    mmsi,
    time: iso(offsetSeconds),
    lat: 1.2,
    lon: 103.9,
    ewsStatus: 3,
    collisionRisk: 'none',
    closestEncounter: null,
    ...extra,
  };
}

describe('VesselLiveStore', () => {
  it('merges positions and safety states into one record per vessel', () => {
    const store = new VesselLiveStore({ now: () => T0 });
    store.upsertPositions([position(525005223, 0), position(525005224, 0)]);
    store.upsertSafetyStates([safety(525005223, -5, { ewsStatus: 0, collisionRisk: 'high' })]);
    expect(store.size).toBe(2);
    const record = store.get(525005223);
    expect(record?.position?.sog).toBe(10);
    expect(record?.safety).toMatchObject({ ewsStatus: 0, collisionRisk: 'high' });
    // the position is newer than the safety state: its coordinates win
    expect(record).toMatchObject({ lat: 1.14, lon: 103.85, updatedAt: T0 });
  });

  it('takes the coordinates of the most recent message', () => {
    const store = new VesselLiveStore();
    store.upsertPositions([position(1, 0)]);
    store.upsertSafetyStates([safety(1, 30)]);
    expect(store.get(1)).toMatchObject({ lat: 1.2, lon: 103.9, updatedAt: T0 + 30_000 });
  });

  it('ignores out-of-order (older) messages', () => {
    const store = new VesselLiveStore();
    store.upsertPositions([position(1, 60, 2, 104)]);
    expect(store.upsertPositions([position(1, 0, 1, 103)])).toBe(0);
    expect(store.get(1)).toMatchObject({ lat: 2, lon: 104 });
    store.upsertSafetyStates([safety(1, 60, { ewsStatus: 1 })]);
    store.upsertSafetyStates([safety(1, 10, { ewsStatus: 0 })]);
    expect(store.get(1)?.safety?.ewsStatus).toBe(1);
  });

  it('keeps the vessel identity of the REST seed across updates', () => {
    const store = new VesselLiveStore();
    store.upsertPositions([
      {
        ...position(7, 0),
        vessel: { id: 'v-7', name: 'KM Kelud', typeCode: 'ro_ro_passenger_ship' },
      },
    ]);
    store.upsertPositions([position(7, 5)]);
    expect(store.get(7)?.vessel).toEqual({
      id: 'v-7',
      name: 'KM Kelud',
      typeCode: 'ro_ro_passenger_ship',
    });
    expect(store.get(7)?.position).not.toHaveProperty('vessel');
  });

  it('prunes vessels without data for 30 minutes', () => {
    let now = T0;
    const store = new VesselLiveStore({ now: () => now });
    store.upsertPositions([position(1, 0), position(2, 25 * 60)]);
    now = T0 + 31 * 60_000;
    expect(store.prune()).toBe(1);
    expect(store.get(1)).toBeUndefined();
    expect(store.get(2)).toBeDefined();
  });

  it('caches snapshots until the store changes and notifies listeners once per batch', () => {
    const store = new VesselLiveStore();
    const listener = vi.fn();
    const vesselListener = vi.fn();
    store.subscribe(listener);
    const unsubscribe = store.subscribeVessel(2, vesselListener);
    store.upsertPositions([position(1, 0), position(2, 0), position(3, 0)]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(vesselListener).toHaveBeenCalledTimes(1);
    const first = store.snapshot();
    expect(store.snapshot()).toBe(first);
    store.upsertPositions([position(1, 10)]);
    expect(store.snapshot()).not.toBe(first);
    expect(vesselListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.upsertPositions([position(2, 20)]);
    expect(vesselListener).toHaveBeenCalledTimes(1);
    expect(store.getVersion()).toBe(3);
  });

  it('filters by bbox, including bboxes across the antimeridian', () => {
    const store = new VesselLiveStore();
    store.upsertPositions([
      position(1, 0, 1, 104),
      position(2, 0, -5, 120),
      position(3, 0, 0, 179.5),
    ]);
    expect(store.inBBox([103, 0, 105, 2]).map((r) => r.mmsi)).toEqual([1]);
    expect(inBBox({ lat: 0, lon: -179.5 }, [179, -1, -179, 1])).toBe(true);
    expect(inBBox({ lat: 0, lon: 0 }, [179, -1, -179, 1])).toBe(false);
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe('realtime payload guards', () => {
  it('keeps only valid items of a batch', () => {
    const items = batchItems(
      { at: iso(0), items: [position(1, 0), { mmsi: 'x' }, { ...position(2, 0), lat: 95 }, null] },
      isRealtimePosition,
    );
    expect(items.map((item) => item.mmsi)).toEqual([1]);
    expect(batchItems(null, isRealtimePosition)).toEqual([]);
    expect(isRealtimeSafetyState(safety(1, 0))).toBe(true);
    expect(isRealtimeSafetyState({ ...safety(1, 0), ewsStatus: 2 })).toBe(false);
  });

  it('checks cii:updated payloads', () => {
    expect(
      isCiiUpdate({ mmsi: 1, year: 2026, attained: 5.1, required: 5.4, rating: 0.94, grade: 'B' }),
    ).toBe(true);
    expect(
      isCiiUpdate({ mmsi: 1, year: 2026, attained: 5.1, required: 5.4, rating: 0.94, grade: 'F' }),
    ).toBe(false);
  });
});
