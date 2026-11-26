import {
  countGeometryPositions,
  ZONE_MAX_VERTICES,
  type ZoneKind,
} from '@darmawanweb/ais-its-contracts/domain';

import type { GeoJsonGeometryDto } from '@/shared/api/generated/geo/model';

export type GeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection';

const POLYGONS = ['Polygon', 'MultiPolygon'] as const;
const LINES = ['LineString', 'MultiLineString'] as const;
const POINTS = ['Point', 'MultiPoint'] as const;

/**
 * Geometry types the geo service accepts per zone kind (geo README, "Zone kinds and geometry
 * rules"; `422 ZONE_GEOMETRY_TYPE_NOT_ALLOWED` otherwise).
 */
export const KIND_GEOMETRY_TYPES: Readonly<Record<ZoneKind, readonly GeometryType[]>> = {
  pipeline: LINES,
  transhipment_area: POLYGONS,
  fishing_ground: POLYGONS,
  mpa: POLYGONS,
  shallow_water: POLYGONS,
  restricted: [...POLYGONS, ...POINTS],
  anchorage: [...POLYGONS, ...POINTS],
  port: [...POLYGONS, ...POINTS],
  tss_lane: [...POLYGONS, ...LINES],
  custom: [...POLYGONS, ...LINES, ...POINTS, 'GeometryCollection'],
};

/** Kinds whose zones the surveillance `geofence` detector watches (alert on enter). */
export const GEOFENCE_KINDS: readonly ZoneKind[] = ['restricted', 'mpa', 'custom'];

export type DrawTool = 'polygon' | 'linestring' | 'point';

/** Drawing tools allowed for a kind (a point is a circle of `bufferM`). */
export function toolsForKind(kind: ZoneKind): DrawTool[] {
  const types = KIND_GEOMETRY_TYPES[kind];
  const tools: DrawTool[] = [];
  if (types.includes('Polygon')) tools.push('polygon');
  if (types.includes('LineString')) tools.push('linestring');
  if (types.includes('Point')) tools.push('point');
  return tools;
}

/** `true` for Point and MultiPoint geometries (they need a buffer > 0). */
export function isPointGeometry(
  geometry: Pick<GeoJsonGeometryDto, 'type'> | null | undefined,
): boolean {
  return geometry?.type === 'Point' || geometry?.type === 'MultiPoint';
}

export type GeometryIssueCode =
  | 'GEOMETRY_REQUIRED'
  | 'ZONE_GEOMETRY_TYPE_NOT_ALLOWED'
  | 'ZONE_GEOMETRY_TOO_COMPLEX'
  | 'ZONE_BUFFER_REQUIRED'
  | 'ZONE_GEOMETRY_CROSSES_ANTIMERIDIAN'
  | 'GEOMETRY_OUT_OF_BOUNDS';

export interface GeometryIssue {
  code: GeometryIssueCode;
  params?: Record<string, string | number>;
}

type Position = [number, number, ...number[]];

/** Every line of positions (rings, lines; one per point) of a simple geometry. */
function linesOf(geometry: GeoJsonGeometryDto): Position[][] {
  const coordinates = (geometry.coordinates ?? []) as unknown;
  switch (geometry.type) {
    case 'Point':
      return [[coordinates as Position]];
    case 'MultiPoint':
    case 'LineString':
      return [coordinates as Position[]];
    case 'MultiLineString':
    case 'Polygon':
      return coordinates as Position[][];
    case 'MultiPolygon':
      return (coordinates as Position[][][]).flat();
    case 'GeometryCollection':
      return (geometry.geometries ?? []).flatMap(linesOf);
  }
}

/**
 * Checks a zone geometry the way the geo service does before PostGIS (steps 2–6 of its
 * validation): type allowed for the kind, at most 50 000 vertices, a buffer for point zones,
 * no edge across the antimeridian, WGS84 bounds. Validity (`ST_IsValid`, e.g. a
 * self-intersection) is only known to the service (`422 ZONE_GEOMETRY_INVALID`).
 */
export function validateZoneGeometry(
  kind: ZoneKind,
  geometry: GeoJsonGeometryDto | null | undefined,
  bufferM: number,
): GeometryIssue[] {
  if (!geometry) return [{ code: 'GEOMETRY_REQUIRED' }];
  const issues: GeometryIssue[] = [];
  const allowed = KIND_GEOMETRY_TYPES[kind];
  if (!allowed.includes(geometry.type)) {
    issues.push({
      code: 'ZONE_GEOMETRY_TYPE_NOT_ALLOWED',
      params: { type: geometry.type, allowed: allowed.join(', ') },
    });
  }
  const lines = linesOf(geometry);
  let vertices = 0;
  try {
    vertices = countGeometryPositions(geometry as Parameters<typeof countGeometryPositions>[0]);
  } catch {
    vertices = lines.reduce((sum, line) => sum + line.length, 0);
  }
  if (vertices > ZONE_MAX_VERTICES) {
    issues.push({
      code: 'ZONE_GEOMETRY_TOO_COMPLEX',
      params: { count: vertices, max: ZONE_MAX_VERTICES },
    });
  }
  if (isPointGeometry(geometry) && !(bufferM > 0)) issues.push({ code: 'ZONE_BUFFER_REQUIRED' });
  for (const line of lines) {
    for (const position of line) {
      const [lon, lat] = position;
      if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) {
        issues.push({ code: 'GEOMETRY_OUT_OF_BOUNDS', params: { lon, lat } });
        return issues;
      }
    }
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1];
      const b = line[i];
      if (a && b && Math.abs(b[0] - a[0]) > 180) {
        issues.push({ code: 'ZONE_GEOMETRY_CROSSES_ANTIMERIDIAN' });
        return issues;
      }
    }
  }
  return issues;
}

/** Number of positions of a geometry (ring closures included), 0 without one. */
export function vertexCount(geometry: GeoJsonGeometryDto | null | undefined): number {
  if (!geometry) return 0;
  try {
    return countGeometryPositions(geometry as Parameters<typeof countGeometryPositions>[0]);
  } catch {
    return linesOf(geometry).reduce((sum, line) => sum + line.length, 0);
  }
}
