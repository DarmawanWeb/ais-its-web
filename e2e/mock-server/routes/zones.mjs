// Mock endpoints of the geo service (feature `zones`, spec §13.6): the zone registry with the
// service's tenancy, validation (problem codes of the geo README), optimistic concurrency
// (ETag = quoted updatedAt, If-Match → 412 ZONE_VERSION_CONFLICT) and the map FeatureCollection.
import { randomUUID } from 'node:crypto';

import { FLEET_ORG_ID, MockHttpError, ORGS, pageOf } from '../lib.mjs';

const zoneId = (n) => `0192f0c8-7d3a-7c2e-9a1f-${String(n).padStart(12, '0')}`;
const SEED_TIME = '2026-11-01T00:00:00.000Z';

const KIND_TYPES = {
  pipeline: ['LineString', 'MultiLineString'],
  transhipment_area: ['Polygon', 'MultiPolygon'],
  fishing_ground: ['Polygon', 'MultiPolygon'],
  mpa: ['Polygon', 'MultiPolygon'],
  shallow_water: ['Polygon', 'MultiPolygon'],
  restricted: ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint'],
  anchorage: ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint'],
  port: ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint'],
  tss_lane: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
  custom: [
    'Polygon',
    'MultiPolygon',
    'LineString',
    'MultiLineString',
    'Point',
    'MultiPoint',
    'GeometryCollection',
  ],
};
const CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_VERTICES = 50_000;

const box = (minLon, minLat, maxLon, maxLat) => [
  [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ],
];

function seedZones() {
  const zone = (n, fields) => ({
    id: zoneId(n),
    orgId: null,
    code: '',
    name: '',
    kind: 'custom',
    bufferM: 0,
    alertOnEnter: false,
    active: true,
    properties: {},
    source: null,
    createdBy: null,
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    ...fields,
  });
  return [
    zone(1, {
      code: 'mvp-pipeline',
      name: 'Pipa gas bawah laut Batam',
      kind: 'pipeline',
      bufferM: 1750,
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.86, 1.08],
          [103.9, 1.1],
          [103.95, 1.115],
          [104.0, 1.125],
          [104.05, 1.14],
        ],
      },
      properties: {
        operator: 'PT Gas Nusantara',
        markers: [
          { name: 'KP 0.000', lat: 1.08, lon: 103.86 },
          { name: 'KP 10.500', lat: 1.125, lon: 104.0 },
        ],
        note: 'MVP dataset, origin to be cited from the thesis',
      },
      source: 'data/legacy/pipeline.json (MVP backend)',
    }),
    zone(2, {
      code: 'mvp-batam-transhipment',
      name: 'Area transhipment Batam',
      kind: 'transhipment_area',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [box(103.72, 1.05, 103.92, 1.16), box(103.94, 1.17, 104.08, 1.25)],
      },
      properties: { note: 'MVP dataset, origin to be cited from the thesis' },
      source: 'data/legacy/batam.json (MVP backend)',
    }),
    zone(3, {
      code: 'btm-anchorage-a',
      name: 'Area labuh jangkar Batu Ampar',
      kind: 'anchorage',
      bufferM: 800,
      geometry: { type: 'Point', coordinates: [104.02, 1.17] },
      properties: { unlocode: 'IDBTM', maxDraughtM: 12 },
      source: 'Peta Laut Dishidros 2026',
    }),
    zone(4, {
      code: 'btm-restricted',
      name: 'Area terlarang Batu Ampar',
      kind: 'restricted',
      alertOnEnter: true,
      geometry: { type: 'Polygon', coordinates: box(104.06, 1.19, 104.11, 1.23) },
      properties: { authority: 'KSOP Batam', legalBasis: 'Perhubungan Laut 2026' },
      source: 'Maklumat Pelayaran KSOP Batam',
    }),
    zone(5, {
      code: 'natuna-fishing',
      name: 'Daerah penangkapan ikan Natuna Utara',
      kind: 'fishing_ground',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [107.2, 3.2],
            [109.1, 3.3],
            [109.3, 4.9],
            [107.5, 5.0],
            [107.2, 3.2],
          ],
        ],
      },
      properties: { authority: 'KKP', legalBasis: 'WPP-NRI 711' },
      source: 'KKP WPP-NRI 711',
    }),
    zone(6, {
      code: 'btm-port',
      name: 'Pelabuhan Batu Ampar',
      kind: 'port',
      geometry: { type: 'Polygon', coordinates: box(103.99, 1.155, 104.015, 1.175) },
      properties: { unlocode: 'IDBTM' },
      source: 'RIP Pelabuhan Batam',
    }),
    zone(7, {
      code: 'anambas-mpa',
      name: 'Kawasan konservasi Anambas',
      kind: 'mpa',
      alertOnEnter: true,
      geometry: { type: 'Polygon', coordinates: box(105.6, 2.8, 106.4, 3.5) },
      properties: { authority: 'KKP', legalBasis: 'Kepmen KP 37/2014' },
      source: 'KKP',
    }),
    zone(8, {
      code: 'sg-tss',
      name: 'TSS Selat Singapura',
      kind: 'tss_lane',
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.6, 1.2],
          [103.8, 1.22],
          [104.0, 1.25],
          [104.3, 1.3],
        ],
      },
      properties: { directionDeg: 75, maxSpeedKn: 12 },
      source: 'IMO COLREG.2/Circ.',
    }),
    zone(9, {
      orgId: FLEET_ORG_ID,
      code: 'pelni-geofence',
      name: 'Geofence armada Sekupang',
      kind: 'custom',
      alertOnEnter: true,
      geometry: { type: 'Polygon', coordinates: box(103.8, 1.12, 103.86, 1.16) },
      properties: { authority: 'PT Pelayaran Nusantara', note: 'Area tunggu armada' },
      source: 'Survei internal 2026',
      createdBy: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6b',
    }),
    zone(10, {
      orgId: FLEET_ORG_ID,
      code: 'galang-shallow',
      name: 'Perairan dangkal Galang',
      kind: 'shallow_water',
      active: false,
      geometry: { type: 'Polygon', coordinates: box(104.12, 0.72, 104.2, 0.8) },
      properties: { depthM: 4.5 },
      source: null,
      createdBy: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6b',
    }),
    zone(11, {
      orgId: ORGS[1].id,
      code: 'ksop-inspection',
      name: 'Area pemeriksaan KSOP',
      kind: 'custom',
      geometry: { type: 'Point', coordinates: [104.0, 1.2] },
      bufferM: 600,
      properties: {},
      source: 'KSOP Batam',
    }),
  ];
}

let zones = seedZones();

const rolesOf = (claims) => claims?.roles ?? [];
const seesAll = (claims) =>
  rolesOf(claims).includes('authority') || rolesOf(claims).includes('super_admin');
const visible = (claims, zone) =>
  zone.orgId === null || seesAll(claims) || zone.orgId === claims?.org;

function positionsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'GeometryCollection')
    return (geometry.geometries ?? []).flatMap(positionsOf);
  const walk = (value) => (typeof value?.[0] === 'number' ? [value] : (value ?? []).flatMap(walk));
  return walk(geometry.coordinates);
}

function bboxOf(geometry) {
  const positions = positionsOf(geometry);
  if (positions.length === 0) return [0, 0, 0, 0];
  const lons = positions.map((p) => p[0]);
  const lats = positions.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

const summaryOf = (zone) => {
  const { geometry, ...rest } = zone;
  return {
    ...rest,
    global: zone.orgId === null,
    geometryType: geometry.type,
    vertexCount: positionsOf(geometry).length,
    bbox: bboxOf(geometry),
  };
};
const dtoOf = (zone) => ({ ...summaryOf(zone), geometry: zone.geometry });
const etagOf = (zone) => `"${zone.updatedAt}"`;

function kindsOf(url) {
  return url.searchParams
    .getAll('kind')
    .flatMap((value) => value.split(','))
    .filter(Boolean);
}

function intersects(zone, bbox) {
  if (!bbox) return true;
  const [minLon, minLat, maxLon, maxLat] = bboxOf(zone.geometry);
  const pad = (zone.bufferM || 0) / 111_000;
  return !(
    maxLon + pad < bbox[0] ||
    minLon - pad > bbox[2] ||
    maxLat + pad < bbox[1] ||
    minLat - pad > bbox[3]
  );
}

function filtered(url, claims, { activeDefault } = {}) {
  const kinds = kindsOf(url);
  const active = url.searchParams.get('active') ?? activeDefault;
  const orgId = url.searchParams.get('orgId');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  const bboxText = url.searchParams.get('bbox');
  const bbox = bboxText ? bboxText.split(',').map(Number) : null;
  if (orgId && !seesAll(claims) && orgId !== claims?.org) {
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden', {
      detail: 'Owner filter on another organization',
    });
  }
  return zones
    .filter(
      (zone) =>
        visible(claims, zone) &&
        (kinds.length === 0 || kinds.includes(zone.kind)) &&
        (active === undefined || active === null || String(zone.active) === active) &&
        (!orgId || zone.orgId === orgId) &&
        (!search ||
          zone.name.toLowerCase().includes(search) ||
          zone.code.toLowerCase().includes(search)) &&
        intersects(zone, bbox),
    )
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
}

const validation = (field, message) =>
  new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
    errors: [{ field, message }],
  });

function segmentsIntersect([a, b], [c, d]) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Self-intersection of a ring (stands in for PostGIS ST_IsValidDetail). */
function selfIntersection(ring) {
  const edges = ring.slice(1).map((point, index) => [ring[index], point]);
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 2; j < edges.length; j += 1) {
      if (i === 0 && j === edges.length - 1) continue;
      if (segmentsIntersect(edges[i], edges[j])) return edges[i][1];
    }
  }
  return null;
}

/** The geo service's validation steps 2–8 (README "Zone kinds and geometry rules"). */
function validateGeometry(kind, geometry, bufferM) {
  if (
    !geometry ||
    typeof geometry.type !== 'string' ||
    (!geometry.coordinates && !geometry.geometries)
  ) {
    throw validation('geometry', 'geometry must be a GeoJSON geometry ([longitude, latitude])');
  }
  const positions = positionsOf(geometry);
  if (positions.some(([lon, lat]) => !(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90))) {
    throw validation(
      'geometry.coordinates',
      'positions must be [longitude, latitude] within WGS84 bounds',
    );
  }
  if (!(KIND_TYPES[kind] ?? []).includes(geometry.type)) {
    throw new MockHttpError(
      422,
      'ZONE_GEOMETRY_TYPE_NOT_ALLOWED',
      'Geometry type not allowed for the zone kind',
      {
        detail: `A ${kind} zone takes ${KIND_TYPES[kind].join(', ')}, not ${geometry.type}`,
      },
    );
  }
  if (positions.length > MAX_VERTICES) {
    throw new MockHttpError(422, 'ZONE_GEOMETRY_TOO_COMPLEX', 'Geometry too complex', {
      detail: `${positions.length} vertices, at most ${MAX_VERTICES}`,
    });
  }
  if ((geometry.type === 'Point' || geometry.type === 'MultiPoint') && !(bufferM > 0)) {
    throw new MockHttpError(422, 'ZONE_BUFFER_REQUIRED', 'Point zones need a buffer', {
      detail: 'bufferM must be greater than 0 for point zones',
    });
  }
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.flat()
        : [];
  for (const ring of rings) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (ring.length < 4 || first[0] !== last[0] || first[1] !== last[1]) {
      throw validation(
        'geometry.coordinates',
        'polygon rings must be closed with at least 4 positions',
      );
    }
    const at = selfIntersection(ring);
    if (at) {
      throw new MockHttpError(422, 'ZONE_GEOMETRY_INVALID', 'Invalid geometry', {
        detail: `Self-intersection [${at[0]} ${at[1]}]`,
      });
    }
  }
}

function checkWritable(claims, zone) {
  if (rolesOf(claims).includes('super_admin')) return;
  if (zone.orgId === null) {
    if (!rolesOf(claims).includes('authority')) {
      throw new MockHttpError(
        403,
        'GLOBAL_ZONE_WRITE_FORBIDDEN',
        'Global zones are written by super_admin and authority',
      );
    }
    return;
  }
  if (zone.orgId !== claims?.org)
    throw new MockHttpError(403, 'ZONE_WRITE_FORBIDDEN', 'Zone of another organization');
}

function checkIfMatch(req, zone) {
  const ifMatch = req.headers['if-match'];
  if (!ifMatch || ifMatch === '*') return;
  if (ifMatch !== etagOf(zone)) {
    throw new MockHttpError(412, 'ZONE_VERSION_CONFLICT', 'The zone changed since it was read', {
      detail: `If-Match ${ifMatch} does not name the stored version`,
      currentEtag: etagOf(zone),
    });
  }
}

function findVisible(claims, id) {
  const zone = zones.find((item) => item.id === id);
  if (!zone || !visible(claims, zone))
    throw new MockHttpError(404, 'ZONE_NOT_FOUND', 'Zone not found');
  return zone;
}

const nextUpdatedAt = (previous) =>
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/zones',
    permission: 'zone:read',
    handler: ({ url, claims, send }) =>
      send(200, pageOf(filtered(url, claims).map(summaryOf), url)),
  },
  {
    method: 'GET',
    path: '/api/v2/zones/geojson',
    permission: 'zone:read',
    handler: ({ url, claims, send }) => {
      const items = filtered(url, claims, { activeDefault: 'true' });
      const features = items.map((zone) => ({
        type: 'Feature',
        id: zone.id,
        geometry: zone.geometry,
        properties: {
          id: zone.id,
          orgId: zone.orgId,
          global: zone.orgId === null,
          code: zone.code,
          name: zone.name,
          kind: zone.kind,
          bufferM: zone.bufferM,
          alertOnEnter: zone.alertOnEnter,
          active: zone.active,
          updatedAt: zone.updatedAt,
          zoneProperties: { ...zone.properties, ...(zone.source ? { source: zone.source } : {}) },
        },
      }));
      const zoom = url.searchParams.get('zoom');
      send(
        200,
        {
          type: 'FeatureCollection',
          features,
          truncated: false,
          truncatedBy: null,
          limit: 5000,
          vertexLimit: 250_000,
          featureCount: features.length,
          vertexCount: features.reduce(
            (sum, feature) => sum + positionsOf(feature.geometry).length,
            0,
          ),
          zoom: zoom === null ? null : Number(zoom),
          toleranceDeg: 0,
        },
        { 'Content-Type': 'application/geo+json' },
      );
    },
  },
  {
    method: 'GET',
    path: '/api/v2/zones/:id',
    permission: 'zone:read',
    handler: ({ params, claims, send }) => {
      const zone = findVisible(claims, params.id);
      send(200, dtoOf(zone), { ETag: etagOf(zone) });
    },
  },
  {
    method: 'POST',
    path: '/api/v2/zones',
    permission: 'zone:write',
    handler: async ({ claims, body, send }) => {
      const input = await body();
      if ('orgId' in input) throw validation('orgId', 'property orgId should not exist');
      if (typeof input.code !== 'string' || !CODE.test(input.code))
        throw validation('code', 'code must match ^[a-z0-9][a-z0-9._-]{0,63}$');
      if (typeof input.name !== 'string' || input.name.trim() === '' || input.name.length > 200) {
        throw validation('name', 'name must be 1–200 characters');
      }
      if (!KIND_TYPES[input.kind]) throw validation('kind', 'kind must be a zone kind');
      const bufferM = input.bufferM ?? 0;
      if (!(typeof bufferM === 'number' && bufferM >= 0 && bufferM <= 100_000))
        throw validation('bufferM', 'bufferM must be 0–100000');
      if ('properties' in input && input.properties && 'source' in input.properties) {
        throw validation('properties.source', 'properties.source is reserved; use source');
      }
      validateGeometry(input.kind, input.geometry, bufferM);
      const global = input.global === true;
      const roles = rolesOf(claims);
      if (global && !roles.includes('super_admin') && !roles.includes('authority')) {
        throw new MockHttpError(
          403,
          'GLOBAL_ZONE_WRITE_FORBIDDEN',
          'Global zones are written by super_admin and authority',
        );
      }
      if (!global && !claims?.org) {
        throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'An active organization is required');
      }
      const orgId = global ? null : claims.org;
      if (zones.some((zone) => zone.orgId === orgId && zone.code === input.code)) {
        throw new MockHttpError(409, 'ZONE_CODE_TAKEN', 'Zone code already taken', {
          detail: `The code ${input.code} is already used by this owner`,
        });
      }
      const now = new Date().toISOString();
      const zone = {
        id: randomUUID(),
        orgId,
        code: input.code,
        name: input.name.trim(),
        kind: input.kind,
        bufferM,
        alertOnEnter: input.alertOnEnter ?? false,
        active: input.active ?? true,
        properties: input.properties ?? {},
        source: input.source ?? null,
        createdBy: claims?.sub ?? null,
        createdAt: now,
        updatedAt: now,
        geometry: input.geometry,
      };
      zones.push(zone);
      send(201, dtoOf(zone), { ETag: etagOf(zone) });
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/zones/:id',
    permission: 'zone:write',
    handler: async ({ req, params, claims, body, send }) => {
      const zone = findVisible(claims, params.id);
      checkWritable(claims, zone);
      const input = await body();
      if ('orgId' in input || 'code' in input || 'global' in input) {
        throw validation(
          Object.keys(input).find((key) => ['orgId', 'code', 'global'].includes(key)),
          'property should not exist',
        );
      }
      checkIfMatch(req, zone);
      const next = { ...zone, ...input };
      if (typeof next.name !== 'string' || next.name.trim() === '' || next.name.length > 200)
        throw validation('name', 'name must be 1–200 characters');
      if (!KIND_TYPES[next.kind]) throw validation('kind', 'kind must be a zone kind');
      if (!(typeof next.bufferM === 'number' && next.bufferM >= 0 && next.bufferM <= 100_000))
        throw validation('bufferM', 'bufferM must be 0–100000');
      validateGeometry(next.kind, next.geometry, next.bufferM);
      const changed = Object.keys(input).some(
        (key) => JSON.stringify(input[key]) !== JSON.stringify(zone[key]),
      );
      if (changed) Object.assign(zone, input, { updatedAt: nextUpdatedAt(zone.updatedAt) });
      send(200, dtoOf(zone), { ETag: etagOf(zone) });
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/zones/:id',
    permission: 'zone:write',
    handler: ({ req, params, claims, send }) => {
      const zone = findVisible(claims, params.id);
      checkWritable(claims, zone);
      checkIfMatch(req, zone);
      zones = zones.filter((item) => item.id !== zone.id);
      send(204);
    },
  },
];

export function reset() {
  zones = seedZones();
}
