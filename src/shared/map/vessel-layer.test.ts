import { describe, expect, it } from 'vitest';

import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import { SAFETY_COLORS, SAFETY_RING_STYLES } from '@/shared/theme/tokens';

import { DASHED_RING_ICON, VESSEL_ICON_NAMES, type VesselIconAtlas } from './vessel-icons';
import { createVesselLayers, safetyRingColor, safetyRingKind } from './vessel-layer';

function record(
  mmsi: number,
  safety: Partial<NonNullable<VesselLiveRecord['safety']>> | null,
): VesselLiveRecord {
  return {
    mmsi,
    lat: 1.15,
    lon: 103.9,
    updatedAt: Date.now(),
    position: null,
    safety: safety
      ? {
          mmsi,
          time: new Date().toISOString(),
          lat: 1.15,
          lon: 103.9,
          ewsStatus: 3,
          collisionRisk: 'none',
          closestEncounter: null,
          ...safety,
        }
      : null,
  } as unknown as VesselLiveRecord;
}

const entry = { x: 0, y: 0, width: 1, height: 1, anchorX: 0, anchorY: 0, mask: false };
const atlas = {
  url: 'data:image/png;base64,',
  mapping: Object.fromEntries([...VESSEL_ICON_NAMES, DASHED_RING_ICON].map((n) => [n, entry])),
} as VesselIconAtlas;

describe('safety rings', () => {
  it('ranks EWS danger > EWS warning > collision high > medium', () => {
    expect(safetyRingKind(record(1, { ewsStatus: 0, collisionRisk: 'high' }))).toBe('ewsDanger');
    expect(safetyRingKind(record(1, { ewsStatus: 1, collisionRisk: 'high' }))).toBe('ewsWarning');
    expect(safetyRingKind(record(1, { collisionRisk: 'high' }))).toBe('collisionHigh');
    expect(safetyRingKind(record(1, { collisionRisk: 'medium' }))).toBe('collisionMedium');
    expect(safetyRingKind(record(1, { collisionRisk: 'low' }))).toBeNull();
    expect(safetyRingKind(record(1, null))).toBeNull();
    expect(safetyRingColor(record(1, { collisionRisk: 'medium' }))).toBe(
      SAFETY_COLORS.collisionMedium,
    );
  });

  it('keeps high and medium collision risk apart by more than colour', () => {
    expect(SAFETY_RING_STYLES.collisionHigh.line).toBe('solid');
    expect(SAFETY_RING_STYLES.collisionMedium.line).toBe('dashed');
    expect(SAFETY_COLORS.collisionMedium).not.toEqual(SAFETY_COLORS.collisionHigh);
    expect(SAFETY_COLORS.collisionMedium).not.toEqual(SAFETY_COLORS.selected);
  });

  it('draws medium risk with the dashed ring icon and keeps the ring of the selected vessel', () => {
    const records = [
      record(1, { ewsStatus: 0 }),
      record(2, { collisionRisk: 'high' }),
      record(3, { collisionRisk: 'medium' }),
      record(4, null),
    ];
    const layers = createVesselLayers(records, { atlas, selectedMmsi: 3 });
    const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
    expect(Object.keys(byId)).toEqual([
      'vessels-ring',
      'vessels-ring-dashed',
      'vessels-selection',
      'vessels-icons',
    ]);
    const mmsis = (id: string) =>
      (byId[id]!.props.data as VesselLiveRecord[]).map((item) => item.mmsi);
    expect(mmsis('vessels-ring')).toEqual([1, 2]);
    expect(mmsis('vessels-ring-dashed')).toEqual([3]);
    expect(mmsis('vessels-selection')).toEqual([3]);
    expect(mmsis('vessels-icons')).toEqual([1, 2, 3, 4]);
  });

  it('falls back to solid rings and dots until the icon atlas is ready', () => {
    const layers = createVesselLayers([record(3, { collisionRisk: 'medium' })], { atlas: null });
    expect(layers.map((layer) => layer.id)).toEqual([
      'vessels-ring',
      'vessels-selection',
      'vessels-dots',
    ]);
    expect((layers[0]!.props.data as VesselLiveRecord[]).map((item) => item.mmsi)).toEqual([3]);
  });
});
