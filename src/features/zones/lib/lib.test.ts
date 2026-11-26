import { describe, expect, it } from 'vitest';

import type { ZoneDto } from '@/shared/api/generated/geo/model';
import { ApiProblem } from '@/shared/api/problem';

import { combineGeometries, partsBBox, splitGeometry } from './draw-geometry';
import { isPointGeometry, toolsForKind, validateZoneGeometry, vertexCount } from './geometry-rules';
import { parseGeoJsonText, zoneToFeature } from './geojson-io';
import { currentEtagOf, fieldOfPath, zoneProblemMessage } from './problems';
import {
  canWriteGlobal,
  canWriteZone,
  etagOf,
  formValuesOf,
  propertiesOf,
  slugifyCode,
  toCreateBody,
  toUpdateBody,
} from './zone-model';

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [103.9, 1.1],
      [104, 1.1],
      [104, 1.2],
      [103.9, 1.2],
      [103.9, 1.1],
    ],
  ],
};

const zone: ZoneDto = {
  id: '0192f0c8-7d3a-7c2e-9a1f-000000000001',
  orgId: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
  global: false,
  code: 'pelni-geofence',
  name: 'Geofence armada',
  kind: 'custom',
  bufferM: 0,
  alertOnEnter: true,
  active: true,
  properties: { authority: 'PT Pelni', dataset: { sha256: 'abc' } },
  source: null,
  createdBy: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.123Z',
  etag: '"2026-11-21T10:00:00.123Z"',
  geometryType: 'Polygon',
  vertexCount: 5,
  bbox: [103.9, 1.1, 104, 1.2],
  geometry: square,
};

const problem = (
  code: string,
  status: number,
  extra: Partial<ConstructorParameters<typeof ApiProblem>[0]> = {},
) => new ApiProblem({ kind: 'http', status, code, title: code, ...extra });

describe('geometry rules', () => {
  it('offers the tools of each kind', () => {
    expect(toolsForKind('pipeline')).toEqual(['linestring']);
    expect(toolsForKind('anchorage')).toEqual(['polygon', 'point']);
    expect(toolsForKind('tss_lane')).toEqual(['polygon', 'linestring']);
    expect(toolsForKind('custom')).toEqual(['polygon', 'linestring', 'point']);
  });

  it('enforces type, buffer, bounds and the antimeridian', () => {
    expect(validateZoneGeometry('fishing_ground', square, 0)).toEqual([]);
    expect(validateZoneGeometry('pipeline', square, 0)[0]?.code).toBe(
      'ZONE_GEOMETRY_TYPE_NOT_ALLOWED',
    );
    const point = { type: 'Point' as const, coordinates: [104, 1.1] };
    expect(validateZoneGeometry('port', point, 0).map((issue) => issue.code)).toEqual([
      'ZONE_BUFFER_REQUIRED',
    ]);
    expect(validateZoneGeometry('port', point, 500)).toEqual([]);
    expect(isPointGeometry(point)).toBe(true);
    const crossing = {
      type: 'LineString' as const,
      coordinates: [
        [179.5, 0],
        [-179.5, 0],
      ],
    };
    expect(validateZoneGeometry('pipeline', crossing, 0)[0]?.code).toBe(
      'ZONE_GEOMETRY_CROSSES_ANTIMERIDIAN',
    );
    const outside = { type: 'Point' as const, coordinates: [104, 95] };
    expect(validateZoneGeometry('custom', outside, 10)[0]?.code).toBe('GEOMETRY_OUT_OF_BOUNDS');
    expect(validateZoneGeometry('custom', null, 0)[0]?.code).toBe('GEOMETRY_REQUIRED');
    expect(vertexCount(square)).toBe(5);
  });
});

describe('draw geometry', () => {
  it('splits and recombines geometries', () => {
    const parts = splitGeometry({
      type: 'MultiPolygon',
      coordinates: [square.coordinates, square.coordinates],
    });
    expect(parts).toHaveLength(2);
    expect(combineGeometries(parts)?.type).toBe('MultiPolygon');
    expect(combineGeometries(parts.slice(0, 1))?.type).toBe('Polygon');
    const mixed = combineGeometries([
      ...parts.slice(0, 1),
      { type: 'Point', coordinates: [104, 1] },
    ]);
    expect(mixed?.type).toBe('GeometryCollection');
    expect(splitGeometry(mixed)).toHaveLength(2);
    expect(combineGeometries([])).toBeNull();
    expect(splitGeometry({ type: 'Point', coordinates: [104, 1, 12] })).toEqual([
      { type: 'Point', coordinates: [104, 1] },
    ]);
    expect(partsBBox(parts)).toEqual([103.9, 1.1, 104, 1.2]);
  });
});

describe('GeoJSON import', () => {
  it('reads a feature collection and its first feature properties', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Area Labuh', kind: 'anchorage', bufferM: 300 },
          geometry: square,
        },
        { type: 'Feature', properties: {}, geometry: square },
      ],
    });
    const result = parseGeoJsonText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.geometry.type).toBe('MultiPolygon');
    expect(result.properties).toEqual({ name: 'Area Labuh', kind: 'anchorage', bufferM: 300 });
    expect(result.featureCount).toBe(2);
    expect(result.vertexCount).toBe(10);
  });

  it('explains what is wrong with a file', () => {
    expect(parseGeoJsonText('{oops')).toMatchObject({ ok: false, error: 'invalid_json' });
    expect(parseGeoJsonText('{"type":"Topology"}')).toMatchObject({
      ok: false,
      error: 'not_geojson',
    });
    expect(parseGeoJsonText('{"type":"FeatureCollection","features":[]}')).toMatchObject({
      ok: false,
      error: 'empty',
    });
    expect(
      parseGeoJsonText(JSON.stringify({ type: 'Point', coordinates: [1.1, 103.9] })),
    ).toMatchObject({
      ok: false,
      error: 'swapped_coordinates',
    });
    expect(
      parseGeoJsonText(JSON.stringify({ type: 'Point', coordinates: [300, 100] })),
    ).toMatchObject({
      ok: false,
      error: 'out_of_bounds',
    });
    const open = {
      type: 'Polygon',
      coordinates: [
        [
          [103.9, 1.1],
          [104, 1.1],
          [104, 1.2],
        ],
      ],
    };
    expect(parseGeoJsonText(JSON.stringify(open))).toMatchObject({
      ok: false,
      error: 'invalid_geometry',
    });
    expect(parseGeoJsonText('x', 5 * 1024 * 1024)).toMatchObject({ ok: false, error: 'too_large' });
  });

  it('drops altitudes', () => {
    const result = parseGeoJsonText(JSON.stringify({ type: 'Point', coordinates: [104, 1.1, 30] }));
    expect(result).toMatchObject({
      ok: true,
      droppedAltitude: true,
      geometry: { type: 'Point', coordinates: [104, 1.1] },
    });
  });

  it('exports a zone as a feature', () => {
    expect(zoneToFeature(zone)).toMatchObject({
      type: 'Feature',
      id: zone.id,
      properties: { code: 'pelni-geofence' },
    });
  });
});

describe('zone model', () => {
  it('slugifies names into codes', () => {
    expect(slugifyCode('Área Labuh  Batu Ampar!')).toBe('area-labuh-batu-ampar');
    expect(slugifyCode('--x')).toBe('x');
  });

  it('keeps unknown properties and drops the reserved source', () => {
    const values = {
      ...formValuesOf(zone),
      authority: '',
      legalBasis: 'Perda 1/2026',
      note: 'Catatan',
    };
    expect(propertiesOf(values, { ...zone.properties, source: 'x' })).toEqual({
      dataset: { sha256: 'abc' },
      legalBasis: 'Perda 1/2026',
      note: 'Catatan',
    });
  });

  it('builds create and update bodies', () => {
    const values = {
      ...formValuesOf(null, { name: 'Zona A', code: 'zona-a' }),
      kind: 'port' as const,
      bufferM: '400',
      unlocode: 'IDBTM',
    };
    const body = toCreateBody(values, { type: 'Point', coordinates: [104, 1.1] }, false);
    expect(body).toMatchObject({
      code: 'zona-a',
      kind: 'port',
      bufferM: 400,
      properties: { unlocode: 'IDBTM' },
      source: null,
    });
    expect(body).not.toHaveProperty('global');
    expect(toCreateBody(values, square, true).global).toBe(false);

    const unchanged = toUpdateBody(zone, formValuesOf(zone), square, false);
    expect(unchanged).toEqual({});
    const changed = toUpdateBody(
      zone,
      { ...formValuesOf(zone), name: 'Baru', source: 'Survei 2026' },
      square,
      true,
    );
    expect(changed).toEqual({ name: 'Baru', source: 'Survei 2026', geometry: square });
  });

  it('decides who may write a zone', () => {
    const base = { canWrite: true, isSuperAdmin: false, isAuthority: false, orgId: zone.orgId };
    expect(canWriteZone(base, zone)).toBe(true);
    expect(canWriteZone({ ...base, orgId: 'other' }, zone)).toBe(false);
    expect(canWriteZone(base, { global: true, orgId: null })).toBe(false);
    expect(canWriteZone({ ...base, isAuthority: true }, { global: true, orgId: null })).toBe(true);
    expect(canWriteZone({ ...base, isSuperAdmin: true, orgId: null }, zone)).toBe(true);
    expect(canWriteZone({ ...base, canWrite: false }, zone)).toBe(false);
    expect(canWriteGlobal(base)).toBe(false);
    expect(canWriteGlobal({ ...base, isAuthority: true })).toBe(true);
  });

  it('uses the ETag header or the quoted updatedAt', () => {
    expect(etagOf('"2026-11-22T00:00:00.000Z"', zone)).toBe('"2026-11-22T00:00:00.000Z"');
    expect(etagOf(null, zone)).toBe('"2026-11-21T10:00:00.123Z"');
  });
});

describe('problem messages', () => {
  it('maps the geo problem codes to messages and fields', () => {
    expect(zoneProblemMessage(problem('ZONE_CODE_TAKEN', 409))).toMatchObject({
      key: 'codeTaken',
      field: 'code',
    });
    expect(zoneProblemMessage(problem('ZONE_VERSION_CONFLICT', 412))).toMatchObject({
      conflict: true,
    });
    expect(
      zoneProblemMessage(
        problem('ZONE_GEOMETRY_INVALID', 422, { detail: 'Self-intersection [104.07 0.94]' }),
      ),
    ).toMatchObject({
      key: 'invalid',
      field: 'geometry',
      params: { detail: 'Self-intersection [104.07 0.94]' },
    });
    expect(
      zoneProblemMessage(
        problem('ZONE_QUOTA_EXCEEDED', 409, {
          extensions: { resource: 'zones', used: 1000, requested: 1, limit: 1000 },
        }),
      ),
    ).toMatchObject({ key: 'quotaZones', params: { limit: 1000 } });
    expect(
      zoneProblemMessage(
        problem('VALIDATION_FAILED', 400, {
          errors: [{ field: 'geometry.coordinates', message: 'bad' }],
        }),
      ),
    ).toMatchObject({ key: 'validation', field: 'geometry' });
    expect(zoneProblemMessage(problem('FORBIDDEN', 403)).key).toBe('forbidden');
    expect(fieldOfPath('properties.depthM')).toBe('properties');
    expect(
      currentEtagOf(problem('ZONE_VERSION_CONFLICT', 412, { extensions: { currentEtag: '"v2"' } })),
    ).toBe('"v2"');
  });
});
