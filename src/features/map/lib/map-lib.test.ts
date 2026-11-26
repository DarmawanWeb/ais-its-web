import type {
  RealtimePosition,
  RealtimeSafetyState,
} from '@darmawanweb/ais-its-contracts/realtime';
import { describe, expect, it } from 'vitest';

import type { EncounterDto } from '@/shared/api/generated/safety/model';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';

import { deadReckon, encounterOverlays, riskRgba } from './encounters';
import { eventMarkers, heatmapCellKm, snappedBbox } from './surveillance';
import { playedCount, positionAt, trackLengthNm, trackParams, trackSamples } from './track';
import { DEFAULT_LAYERS, parseMapUrl, writeMapUrl } from './url-state';
import { filterVessels, NO_FILTERS, searchLiveVessels, vesselStats } from './vessel-filters';
import { buildVesselBuffers, clusterVessels, createVesselLayers, vesselLod } from './vessel-layers';
import { zoneLayers, zonesQueryArea, zonesTileUrl } from './zones-style';

function record(
  mmsi: number,
  options: {
    lat?: number;
    lon?: number;
    name?: string;
    typeCode?: string;
    navstatus?: number;
    source?: RealtimePosition['source'];
    safety?: Partial<RealtimeSafetyState>;
    hdg?: number;
  } = {},
): VesselLiveRecord {
  const {
    lat = 1.1,
    lon = 103.9,
    name = `Vessel ${mmsi}`,
    typeCode = 'tanker',
    navstatus = 0,
    source = 'primary',
  } = options;
  const time = '2026-11-22T10:00:00.000Z';
  return {
    mmsi,
    lat,
    lon,
    updatedAt: Date.parse(time),
    vessel: { name, typeCode },
    position: {
      mmsi,
      time,
      lat,
      lon,
      sog: 10,
      cog: 90,
      hdg: options.hdg ?? 45,
      navstatus,
      predictedNavstatus: 0,
      source,
    },
    safety: options.safety
      ? {
          mmsi,
          time,
          lat,
          lon,
          ewsStatus: 3,
          collisionRisk: 'none',
          closestEncounter: null,
          ...options.safety,
        }
      : null,
  };
}

describe('map URL state', () => {
  it('parses centre, zoom, vessel, layers and sources with defaults', () => {
    expect(parseMapUrl(new URLSearchParams(''))).toEqual({
      center: null,
      zoom: null,
      vessel: null,
      layers: [...DEFAULT_LAYERS],
      sources: ['primary', 'batam', 'pusher'],
    });
    const state = parseMapUrl(
      new URLSearchParams(
        'lat=1.2&lon=103.9&z=11.5&vessel=525005223&layers=heatmap,vessels,bogus&src=batam',
      ),
    );
    expect(state.center).toEqual([103.9, 1.2]);
    expect(state.zoom).toBe(11.5);
    expect(state.vessel).toBe(525005223);
    expect(state.layers).toEqual(['vessels', 'heatmap']);
    expect(state.sources).toEqual(['batam']);
    expect(parseMapUrl(new URLSearchParams('lat=200&lon=1&vessel=12')).center).toBeNull();
    expect(parseMapUrl(new URLSearchParams('layers=')).layers).toEqual([]);
  });

  it('writes the state compactly and keeps other params', () => {
    const next = writeMapUrl(
      {
        center: [103.856406, 1.143238],
        zoom: 9.123,
        vessel: 525005223,
        layers: [...DEFAULT_LAYERS],
        sources: ['primary'],
      },
      new URLSearchParams('foo=1&layers=heatmap'),
    );
    expect(Object.fromEntries(next)).toEqual({
      foo: '1',
      lat: '1.14324',
      lon: '103.85641',
      z: '9.12',
      vessel: '525005223',
      src: 'primary',
    });
    expect(writeMapUrl({ vessel: null, center: null }, next).has('vessel')).toBe(false);
  });
});

describe('vessel filters and search', () => {
  const records = [
    record(1, { safety: { ewsStatus: 0 }, typeCode: 'tanker', source: 'batam' }),
    record(2, { safety: { collisionRisk: 'medium' }, typeCode: 'container_ship', navstatus: 1 }),
    record(3, { name: 'KM Bahari Nusantara', typeCode: 'general_cargo_ship' }),
    record(525005223, { name: 'MT Selat Jaya' }),
  ];

  it('filters by safety class, category, navstatus and source', () => {
    expect(filterVessels(records, NO_FILTERS)).toBe(records);
    expect(
      filterVessels(records, { ...NO_FILTERS, safety: new Set(['ewsDanger']) }).map((r) => r.mmsi),
    ).toEqual([1]);
    expect(
      filterVessels(records, { ...NO_FILTERS, categories: new Set(['contai']) }).map((r) => r.mmsi),
    ).toEqual([2]);
    expect(
      filterVessels(records, { ...NO_FILTERS, navstatus: new Set([1]) }).map((r) => r.mmsi),
    ).toEqual([2]);
    expect(
      filterVessels(records, { ...NO_FILTERS, sources: new Set(['primary']) }).map((r) => r.mmsi),
    ).toEqual([2, 3, 525005223]);
  });

  it('counts the safety classes', () => {
    expect(vesselStats(records)).toEqual({
      total: 4,
      ewsDanger: 1,
      ewsWarning: 0,
      collisionHigh: 0,
      collisionMedium: 1,
    });
  });

  it('searches names (accent and case insensitive) and MMSI prefixes', () => {
    expect(searchLiveVessels(records, 'bahari').map((r) => r.mmsi)).toEqual([3]);
    expect(searchLiveVessels(records, '5250').map((r) => r.mmsi)).toEqual([525005223]);
    expect(searchLiveVessels(records, 'k')).toEqual([]);
  });
});

describe('vessel layers', () => {
  it('chooses the level of detail by zoom', () => {
    expect(vesselLod(4)).toBe('cluster');
    expect(vesselLod(7)).toBe('dot');
    expect(vesselLod(10)).toBe('icon');
    // A crowded view keeps dots: thousands of icons would only overlap.
    expect(vesselLod(10, 3_000)).toBe('icon');
    expect(vesselLod(10, 3_001)).toBe('dot');
    expect(vesselLod(4, 10)).toBe('cluster');
  });

  it('builds typed-array buffers with ring subsets in one pass', () => {
    const records = [
      record(1, { lon: 103.5, lat: 1.5, hdg: 90, safety: { ewsStatus: 0 } }),
      record(2, { lon: 104, lat: 1, safety: { collisionRisk: 'medium' } }),
      record(3),
    ];
    const buffers = buildVesselBuffers(records);
    expect(buffers.length).toBe(3);
    expect(Array.from(buffers.positions.slice(0, 2))).toEqual([103.5, 1.5]);
    expect(buffers.angles[0]).toBe(-90);
    expect(buffers.icons).toEqual(['tanker', 'tanker', 'tanker']);
    expect(buffers.solidRings.length).toBe(1);
    expect(Array.from(buffers.solidRings.indices)).toEqual([0]);
    expect(buffers.dashedRings.length).toBe(1);
    expect(Array.from(buffers.fillColors.slice(0, 4))).toEqual([239, 68, 68, 255]);
    expect(buffers.radii[0]).toBeGreaterThan(buffers.radii[2] ?? 0);
  });

  it('clusters on a grid, keeping the worst safety class', () => {
    const records = [
      record(1, { lon: 103.9, lat: 1.1 }),
      record(2, { lon: 103.91, lat: 1.11, safety: { collisionRisk: 'high' } }),
      record(3, { lon: 110, lat: -5 }),
    ];
    const clusters = clusterVessels(records, 4);
    expect(clusters).toHaveLength(2);
    const busy = clusters.find((c) => c.count === 2);
    expect(busy?.worst).toBe('collisionHigh');
    expect(busy?.position[0]).toBeCloseTo(103.905);
  });

  it('handles 10 000 vessels per snapshot within a frame budget', () => {
    const records = Array.from({ length: 10_000 }, (_, i) =>
      record(400_000_000 + i, {
        lon: 103 + (i % 100) * 0.01,
        lat: 1 + Math.floor(i / 100) * 0.01,
        hdg: (i * 37) % 360,
        ...(i % 50 === 0 ? { safety: { ewsStatus: 1 as const } } : {}),
      }),
    );
    const started = performance.now();
    const visible = filterVessels(records, {
      ...NO_FILTERS,
      safety: new Set(['normal', 'ewsWarning']),
    });
    const buffers = buildVesselBuffers(visible);
    const clusters = clusterVessels(visible, 5);
    const elapsed = performance.now() - started;
    expect(buffers.length).toBe(10_000);
    expect(buffers.solidRings.length).toBe(200);
    expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(10_000);
    // One throttled snapshot (500 ms) must cost far less than its interval, even on a busy CI.
    expect(elapsed).toBeLessThan(250);
  });

  it('creates the layers of each level of detail with binary data', () => {
    const records = [record(1, { safety: { ewsStatus: 1 } }), record(2)];
    const buffers = buildVesselBuffers(records);
    const atlas = { url: 'data:', mapping: {} } as never;
    const dots = createVesselLayers(buffers, null, {
      lod: 'dot',
      zoom: 7,
      atlas,
      selected: records[1] ?? null,
    });
    expect(dots.map((l) => l.id)).toEqual([
      'live-vessels-ring',
      'live-vessels-dots',
      'live-vessels-selection',
    ]);
    expect((dots[1]?.props.data as { length: number }).length).toBe(2);
    const clusters = createVesselLayers(buffers, clusterVessels(records, 3), {
      lod: 'cluster',
      zoom: 3,
      atlas: null,
      selected: null,
    });
    expect(clusters.map((l) => l.id)).toEqual([
      'live-vessels-clusters',
      'live-vessels-cluster-counts',
    ]);
  });
});

describe('encounter overlays', () => {
  it('dead-reckons both vessels to the CPA', () => {
    const [lon, lat] = deadReckon([103, 1], 90, 60, 1);
    expect(lat).toBeCloseTo(1);
    expect(lon).toBeCloseTo(103 + 1 / 60, 4);
    expect(deadReckon([103, 1], 360, 10, 5)).toEqual([103, 1]);
    const encounter = {
      encounterId: 'e',
      mmsiA: 1,
      mmsiB: 2,
      startedAt: '2026-11-22T10:00:00.000Z',
      lastSampleAt: '2026-11-22T10:01:00.000Z',
      peakRisk: 'high',
      minCpaNm: 0.05,
      history: [
        {
          time: '2026-11-22T10:01:00.000Z',
          cpaNm: 0.05,
          tcpaMin: 6,
          rangeNm: 2,
          risk: 'high',
          positions: {
            a: { mmsi: 1, time: '', lat: 1, lon: 103, sog: 10, cog: 90 },
            b: { mmsi: 2, time: '', lat: 1, lon: 103.033, sog: 10, cog: 270 },
          },
        },
      ],
    } as EncounterDto;
    const [overlay] = encounterOverlays([encounter, { ...encounter, history: [] }]);
    expect(overlay?.cpaPoint[0]).toBeCloseTo(103.0165, 3);
    expect(riskRgba('high')).not.toEqual(riskRgba('medium'));
  });
});

describe('track helpers', () => {
  const points = [
    { time: '2026-11-22T10:02:00.000Z', lat: 1.2, lon: 104.2, sog: 12, cog: 90 },
    { time: '2026-11-22T10:00:00.000Z', lat: 1, lon: 104, sog: 10, cog: 80 },
  ].map((p) => ({
    ...p,
    hdg: 0,
    navstatus: 0,
    predictedNavstatus: 0 as const,
    source: 'primary' as const,
  }));

  it('requests raw positions up to a day and the 1-minute aggregate beyond', () => {
    expect(trackParams('6h', Date.parse('2026-11-22T10:00:30.000Z'))).toEqual({
      from: '2026-11-22T04:01:00.000Z',
      to: '2026-11-22T10:01:00.000Z',
      resolution: 'raw',
    });
    expect(trackParams('3d')).toMatchObject({ resolution: '1m', simplify: 25 });
  });

  it('interpolates the playback position and counts the played points', () => {
    const samples = trackSamples(points);
    expect(samples.map((s) => s.lat)).toEqual([1, 1.2]);
    const middle = positionAt(samples, Date.parse('2026-11-22T10:01:00.000Z'));
    expect(middle?.lat).toBeCloseTo(1.1);
    expect(middle?.sog).toBeCloseTo(11);
    expect(positionAt(samples, 0)?.lat).toBe(1);
    expect(positionAt([], 0)).toBeNull();
    expect(playedCount(samples, Date.parse('2026-11-22T10:01:00.000Z'))).toBe(1);
    expect(trackLengthNm(samples)).toBeGreaterThan(16);
  });
});

describe('zones and surveillance helpers', () => {
  it('builds the Martin tile URL and the zone style layers', () => {
    expect(zonesTileUrl('http://app.test')).toBe(
      'http://app.test/tiles/zones_tiles_mvt/{z}/{x}/{y}',
    );
    const layers = zoneLayers({
      source: 'z',
      sourceLayer: 'zones_tiles_mvt',
      showZones: true,
      showPipelines: false,
    });
    expect(layers.map((l) => l.id)).toEqual(['z-fill', 'z-outline', 'z-lines', 'z-points']);
    expect(
      zoneLayers({ source: 'z', showZones: false, showPipelines: true }).map((l) => l.id),
    ).toEqual(['z-pipeline-glow', 'z-pipeline']);
  });

  it('snaps query areas so small moves keep the same key', () => {
    expect(zonesQueryArea([103.81, 1.01, 104.12, 1.33], 9.7)).toEqual(
      zonesQueryArea([103.82, 1.02, 104.1, 1.3], 9.2),
    );
    expect(snappedBbox([103.81, 1.01, 104.12, 1.33], 9)).toBe(
      snappedBbox([103.82, 1.02, 104.1, 1.3], 9),
    );
    expect(heatmapCellKm(1)).toBe(500);
    expect(heatmapCellKm(2)).toBe(469.5);
    expect(heatmapCellKm(18)).toBe(0.5);
  });

  it('keeps only located events of the selected types', () => {
    const base = { id: 'e', type: 'dark', lat: 1, lon: 103 } as never;
    const markers = eventMarkers(
      [
        base,
        { ...(base as object), lat: null } as never,
        { ...(base as object), type: 'fishing' } as never,
      ],
      new Set(['dark']),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.style.letter).toBe('D');
  });
});
