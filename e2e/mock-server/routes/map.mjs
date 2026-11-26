// Live map feature: data the map reads from services whose pages belong to other features —
// zones (geo), surveillance events and the fishing heatmap, a vessel's AIS track, the fleet
// record by MMSI and the Martin vector tiles. Every route is a RegExp, i.e. a fallback: a feature
// that owns the service and declares the same path as a string replaces it without a start-up
// conflict (string routes rank before RegExps). Data around Batam matches the demo vessels.
import { cursorPageOf, FLEET_ORG_ID, MockHttpError, nowIso, vesselId, VESSELS } from '../lib.mjs';
import { vesselTypeOf } from '../base/fleet.mjs';

const MINUTE = 60_000;
const RAD = Math.PI / 180;
const DEMO_AT = '2026-11-01T00:00:00.000Z';

/** Same line as the safety module's demo pipeline (EWS distances are measured to it). */
const PIPELINE = [
  [103.66, 1.232],
  [103.76, 1.2],
  [103.85, 1.172],
  [103.9025, 1.1528],
  [103.945, 1.112],
  [103.99, 1.081],
  [104.06, 1.045],
];

const square = (lon, lat, d) => [
  [
    [lon - d, lat - d],
    [lon + d, lat - d],
    [lon + d, lat + d],
    [lon - d, lat + d],
    [lon - d, lat - d],
  ],
];

/** [id suffix, code, name, kind, orgId, geometry, bufferM]. */
const ZONES = [
  [
    '01',
    'pipa-gas-batam',
    'Pipa Gas Batam (KP 0–48)',
    'pipeline',
    null,
    { type: 'LineString', coordinates: PIPELINE },
    1750,
  ],
  [
    '02',
    'zona-terbatas-nipa',
    'Zona Terbatas Pulau Nipa',
    'restricted',
    null,
    { type: 'Polygon', coordinates: square(104.07, 1.15, 0.025) },
    0,
  ],
  [
    '03',
    'area-transhipment-batam',
    'Area Transhipment Batam',
    'transhipment_area',
    null,
    {
      type: 'Polygon',
      coordinates: [
        [
          [103.94, 1.2],
          [104.02, 1.2],
          [104.02, 1.26],
          [103.94, 1.26],
          [103.94, 1.2],
        ],
      ],
    },
    0,
  ],
  [
    '04',
    'labuh-batu-ampar',
    'Area Labuh Batu Ampar',
    'anchorage',
    FLEET_ORG_ID,
    { type: 'Polygon', coordinates: square(103.985, 1.175, 0.012) },
    0,
  ],
  [
    '05',
    'kkp-natuna-selatan',
    'Daerah Penangkapan Ikan Selatan',
    'fishing_ground',
    null,
    {
      type: 'Polygon',
      coordinates: [
        [
          [103.76, 1.02],
          [103.86, 1.02],
          [103.86, 1.07],
          [103.76, 1.07],
          [103.76, 1.02],
        ],
      ],
    },
    0,
  ],
];

function zoneFeature([suffix, code, name, kind, orgId, geometry, bufferM]) {
  const id = `0192f0c8-7d3a-7c2e-9a1d-0000000000${suffix}`;
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      id,
      orgId,
      global: orgId === null,
      code,
      name,
      kind,
      bufferM,
      alertOnEnter: kind === 'restricted',
      active: true,
      updatedAt: DEMO_AT,
      zoneProperties: kind === 'pipeline' ? { source: 'legacy data/pipeline.json' } : {},
    },
  };
}

const visibleZoneOf = (claims) => (zone) => {
  const orgId = zone[4];
  const roles = claims?.roles ?? [];
  return (
    orgId === null ||
    orgId === claims?.org ||
    roles.includes('super_admin') ||
    roles.includes('authority')
  );
};

/** Kinematics of a demo vessel `minutes` from now (negative: in the past). */
function positionAt(vessel, minutes) {
  const [, , , lat, lon, cog, sog] = vessel;
  // A gentle turn so tracks are not perfectly straight.
  const course = cog + 12 * Math.sin(minutes / 37);
  const nm = (sog * minutes) / 60;
  return {
    lat: lat + (nm / 60) * Math.cos(course * RAD),
    lon: lon + ((nm / 60) * Math.sin(course * RAD)) / Math.cos(lat * RAD),
    cog: (course + 360) % 360,
    sog: Math.max(0, sog + Math.sin(minutes / 11) * 0.6),
  };
}

const SURVEILLANCE = [
  [
    's01',
    'dark',
    'warning',
    'open',
    538007788,
    null,
    1.07,
    103.71,
    48,
    'Kapal gelap: Ocean Bulk Star',
    'dark.ais_gap',
  ],
  [
    's02',
    'transhipment',
    'critical',
    'open',
    563045678,
    525019007,
    1.226,
    103.962,
    180,
    'Dugaan transhipment ilegal',
    'transhipment.accuracy',
  ],
  [
    's03',
    'anomaly',
    'info',
    'resolved',
    525019006,
    null,
    1.02,
    103.93,
    260,
    'Anomali status navigasi: KM Rempang',
    'anomaly.navstatus_mismatch',
  ],
  [
    's04',
    'geofence',
    'warning',
    'resolved',
    636019900,
    null,
    1.164,
    104.05,
    720,
    'Masuk zona terlarang',
    'geo.geofence_enter',
  ],
  [
    's05',
    'fishing',
    'info',
    'open',
    525019009,
    null,
    1.045,
    103.8,
    300,
    'Pola penangkapan ikan',
    'fishing.loitering',
  ],
];

function surveillanceEvents() {
  return SURVEILLANCE.map(
    ([
      suffix,
      type,
      severity,
      status,
      mmsi,
      relatedMmsi,
      lat,
      lon,
      minutesAgo,
      title,
      methodId,
    ]) => {
      const time = new Date(Date.now() - minutesAgo * MINUTE).toISOString();
      const name = VESSELS.find(([m]) => m === mmsi)?.[1] ?? null;
      return {
        id: `0192f0c8-7d3a-7c2e-9a21-0000000${suffix}00`,
        time,
        detector: type,
        type,
        domain: 'surveillance',
        severity,
        currentSeverity: severity,
        mmsi,
        relatedMmsi,
        vesselName: name,
        relatedVesselName: relatedMmsi
          ? (VESSELS.find(([m]) => m === relatedMmsi)?.[1] ?? null)
          : null,
        zoneId: null,
        zoneName: null,
        lat,
        lon,
        title,
        message: title,
        methodId,
        dedupKey: `${type}:${mmsi}`,
        data: { methodId },
        status,
        openedAt: time,
        lastSeenAt: time,
        resolvedAt: status === 'resolved' ? time : null,
        resolution: null,
        reviewedBy: null,
        reviewedAt: null,
        note: null,
        createdAt: time,
      };
    },
  );
}

/** Fishing heatmap cells: two clusters south-west of Batam and around Natuna. */
function heatmapCells(cellKm) {
  const cellDeg = cellKm / 111.32;
  const cells = new Map();
  const add = (lat, lon, count) => {
    const key = `${Math.round(lat / cellDeg)}:${Math.round(lon / cellDeg)}`;
    const cell = cells.get(key) ?? {
      lat: Math.round(lat / cellDeg) * cellDeg,
      lon: Math.round(lon / cellDeg) * cellDeg,
      count: 0,
    };
    cell.count += count;
    cells.set(key, cell);
  };
  for (let i = 0; i < 60; i++) {
    const a = i * 2.399;
    const r = Math.sqrt(i) * 0.012;
    add(1.045 + r * Math.sin(a), 103.8 + r * Math.cos(a), 1 + (i % 4));
    add(3.9 + r * 2 * Math.sin(a), 108.2 + r * 2 * Math.cos(a), 1 + (i % 3));
  }
  return [...cells.values()];
}

function detailOf(vessel) {
  const [mmsi, name, typeCode] = vessel;
  const type = vesselTypeOf(typeCode);
  return {
    view: 'detail',
    id: vesselId(mmsi),
    mmsi,
    imo: String(9_000_000 + (mmsi % 1_000_000)).slice(0, 7),
    name,
    flag: String(mmsi).startsWith('525') ? 'ID' : String(mmsi).startsWith('563') ? 'SG' : null,
    type: {
      ...type,
      ciiShipType: typeCode,
      capacityUnit: 'dwt',
      a: 0,
      c: 0,
      capacityFixed: null,
      ddVector: null,
      createdAt: DEMO_AT,
      updatedAt: DEMO_AT,
    },
    status: 'active',
    photoUrl: null,
    updatedAt: DEMO_AT,
    orgId: FLEET_ORG_ID,
    builtYear: 2012,
    annualVoyagePercentage: 70,
    dimensions: { loaM: 120, beamM: 20, draftM: 7, grossTonnage: 8000, deadweightTonnage: 12000 },
    fuel: null,
    firstFuelFormula: null,
    engines: [],
    ports: [],
    legacyId: null,
    createdAt: DEMO_AT,
  };
}

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: /^\/api\/v2\/zones\/geojson$/,
    permission: 'zone:read',
    handler: ({ url, claims, send }) => {
      const kinds = url.searchParams
        .getAll('kind')
        .flatMap((k) => k.split(','))
        .filter(Boolean);
      const orgId = url.searchParams.get('orgId');
      const features = ZONES.filter(visibleZoneOf(claims))
        .filter(
          (zone) =>
            (!orgId || zone[4] === orgId) && (kinds.length === 0 || kinds.includes(zone[3])),
        )
        .map(zoneFeature);
      const zoom = url.searchParams.get('zoom');
      send(200, {
        type: 'FeatureCollection',
        features,
        truncated: false,
        truncatedBy: null,
        limit: 2000,
        vertexLimit: 200000,
        featureCount: features.length,
        vertexCount: features.reduce(
          (n, f) => n + JSON.stringify(f.geometry.coordinates).split('],[').length,
          0,
        ),
        zoom: zoom === null ? null : Number(zoom),
        toleranceDeg: 0,
      });
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/surveillance\/events$/,
    permission: 'surveillance:read',
    handler: ({ url, send }) => {
      const type = url.searchParams.get('type');
      const items = surveillanceEvents().filter((e) => !type || e.type === type);
      const params = new URL(url);
      for (const key of ['type', 'severity', 'status', 'mmsi', 'from', 'to', 'bbox'])
        params.searchParams.delete(key);
      send(200, cursorPageOf(items, params));
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/surveillance\/heatmap$/,
    permission: 'surveillance:read',
    handler: ({ url, send }) => {
      const cellKm = Number(url.searchParams.get('cellKm') ?? 10);
      if (!Number.isFinite(cellKm) || cellKm < 0.5 || cellKm > 500) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'cellKm', message: '0.5–500' }],
        });
      }
      const cells = heatmapCells(cellKm);
      send(200, {
        cells,
        cellKm,
        cellDeg: cellKm / 111.32,
        from:
          url.searchParams.get('from') ??
          new Date(Date.now() - 30 * 24 * 60 * MINUTE).toISOString(),
        to: nowIso(),
        total: cells.reduce((n, c) => n + c.count, 0),
      });
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/ais\/vessels\/(?<mmsi>\d{9})\/track$/,
    permission: 'ais:read',
    handler: ({ params, url, send }) => {
      const vessel = VESSELS.find(([m]) => String(m) === params.mmsi);
      const to = Date.parse(url.searchParams.get('to') ?? nowIso());
      const from = Date.parse(
        url.searchParams.get('from') ?? new Date(to - 24 * 60 * MINUTE).toISOString(),
      );
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'from', message: 'from must be before to' }],
        });
      }
      const resolution = url.searchParams.get('resolution') === '1m' ? '1m' : 'raw';
      const stepMs = resolution === '1m' ? 5 * MINUTE : MINUTE;
      const points = [];
      if (vessel) {
        const now = Date.now();
        for (
          let t = Math.max(from, now - 7 * 24 * 60 * MINUTE);
          t <= Math.min(to, now);
          t += stepMs
        ) {
          const p = positionAt(vessel, (t - now) / MINUTE);
          points.push({
            time: new Date(t).toISOString(),
            lat: p.lat,
            lon: p.lon,
            sog: Math.round(p.sog * 10) / 10,
            cog: Math.round(p.cog),
            hdg: Math.round(p.cog),
            navstatus: 0,
            predictedNavstatus: 0,
            source: 'primary',
            ...(resolution === '1m'
              ? {
                  samples: 6,
                  sogAvg: Math.round(p.sog * 10) / 10,
                  sogMax: Math.round((p.sog + 0.4) * 10) / 10,
                }
              : {}),
          });
        }
      }
      const simplify = Number(url.searchParams.get('simplify') ?? 0);
      send(200, {
        mmsi: Number(params.mmsi),
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        resolution,
        simplifyM: simplify > 0 ? simplify : null,
        truncated: false,
        remainingTo: null,
        points,
      });
    },
  },
  {
    method: 'GET',
    path: /^\/api\/v2\/vessels\/by-mmsi\/(?<mmsi>\d{9})$/,
    permission: 'vessel:read',
    handler: ({ params, send }) => {
      const vessel = VESSELS.find(([m]) => String(m) === params.mmsi);
      if (!vessel) {
        throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found', {
          detail: `No vessel with MMSI ${params.mmsi}`,
        });
      }
      send(200, detailOf(vessel));
    },
  },
  {
    // Martin vector tiles (/tiles, spec §12): no tile server in the mock. The live map then
    // falls back to GET /zones/geojson for the global zones too.
    method: 'GET',
    path: /^\/tiles\/[\w.-]+\/\d+\/\d+\/\d+(\.pbf|\.mvt)?$/,
    public: true,
    handler: () => {
      throw new MockHttpError(404, 'NOT_FOUND', 'No tile server in the mock gateway');
    },
  },
];
