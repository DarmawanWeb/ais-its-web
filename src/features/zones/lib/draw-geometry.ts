import type { GeoJsonGeometryDto } from '@/shared/api/generated/geo/model';

/** A simple geometry drawn as one terra-draw feature (polygon, line or point). */
export type SimpleGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] };

/**
 * Splits a zone geometry into the simple geometries the editor draws (one terra-draw feature
 * each): Multi* geometries into their parts, a GeometryCollection into its members. Altitudes
 * are dropped (zones are 2-D).
 */
export function splitGeometry(geometry: GeoJsonGeometryDto | null | undefined): SimpleGeometry[] {
  if (!geometry) return [];
  const flat2d = (position: unknown) => (position as number[]).slice(0, 2);
  const coordinates = geometry.coordinates as unknown;
  switch (geometry.type) {
    case 'Point':
      return [{ type: 'Point', coordinates: flat2d(coordinates) }];
    case 'MultiPoint':
      return (coordinates as unknown[]).map((point) => ({
        type: 'Point',
        coordinates: flat2d(point),
      }));
    case 'LineString':
      return [{ type: 'LineString', coordinates: (coordinates as unknown[]).map(flat2d) }];
    case 'MultiLineString':
      return (coordinates as unknown[][]).map((line) => ({
        type: 'LineString',
        coordinates: line.map(flat2d),
      }));
    case 'Polygon':
      return [
        {
          type: 'Polygon',
          coordinates: (coordinates as unknown[][]).map((ring) => ring.map(flat2d)),
        },
      ];
    case 'MultiPolygon':
      return (coordinates as unknown[][][]).map((polygon) => ({
        type: 'Polygon',
        coordinates: polygon.map((ring) => ring.map(flat2d)),
      }));
    case 'GeometryCollection':
      return (geometry.geometries ?? []).flatMap((member) => splitGeometry(member));
  }
}

/**
 * Combines the drawn simple geometries into the zone geometry: one part keeps its type, several
 * parts of one type become a Multi* geometry, mixed types a GeometryCollection (allowed for
 * `custom` zones only — the kind rules report it otherwise).
 */
export function combineGeometries(parts: readonly SimpleGeometry[]): GeoJsonGeometryDto | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return { ...parts[0]! };
  const types = new Set(parts.map((part) => part.type));
  if (types.size === 1) {
    const [type] = types;
    if (type === 'Polygon')
      return { type: 'MultiPolygon', coordinates: parts.map((part) => part.coordinates) };
    if (type === 'LineString')
      return { type: 'MultiLineString', coordinates: parts.map((part) => part.coordinates) };
    return { type: 'MultiPoint', coordinates: parts.map((part) => part.coordinates) };
  }
  return {
    type: 'GeometryCollection',
    geometries: parts.map((part) => ({ ...part })),
  };
}

/** [minLon, minLat, maxLon, maxLat] of drawn parts; `null` without any. */
export function partsBBox(
  parts: readonly SimpleGeometry[],
): [number, number, number, number] | null {
  const positions = parts.flatMap((part) =>
    part.type === 'Point'
      ? [part.coordinates]
      : part.type === 'LineString'
        ? part.coordinates
        : part.coordinates.flat(),
  );
  if (positions.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon = 0, lat = 0] of positions) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLon, minLat, maxLon, maxLat];
}
