import {
  GeoJsonGeometrySchema,
  isZoneKind,
  type ZoneKind,
} from '@darmawanweb/ais-its-contracts/domain';

import type { GeoJsonGeometryDto, ZoneDto } from '@/shared/api/generated/geo/model';

import { combineGeometries, splitGeometry } from './draw-geometry';
import { vertexCount } from './geometry-rules';

/** Largest import accepted (the geo service body limit is 4 MiB). */
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

export type ImportErrorCode =
  | 'too_large'
  | 'invalid_json'
  | 'not_geojson'
  | 'empty'
  | 'invalid_geometry'
  | 'out_of_bounds'
  | 'swapped_coordinates'
  | 'nested_collection';

/** Zone fields found in the first feature's properties (prefilled in the editor). */
export interface ImportedProperties {
  name?: string;
  code?: string;
  kind?: ZoneKind;
  bufferM?: number;
  source?: string;
}

export type ImportResult =
  | {
      ok: true;
      geometry: GeoJsonGeometryDto;
      properties: ImportedProperties;
      featureCount: number;
      vertexCount: number;
      /** Altitudes were present and are dropped (zones are 2-D). */
      droppedAltitude: boolean;
    }
  | { ok: false; error: ImportErrorCode; detail?: string };

interface RawFeature {
  geometry: unknown;
  properties: Record<string, unknown>;
}

function featuresOf(value: unknown): RawFeature[] | null {
  if (!value || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  if (object.type === 'FeatureCollection' && Array.isArray(object.features)) {
    return object.features.map((feature) => {
      const f = (feature ?? {}) as Record<string, unknown>;
      return { geometry: f.geometry, properties: (f.properties as Record<string, unknown>) ?? {} };
    });
  }
  if (object.type === 'Feature') {
    return [
      {
        geometry: object.geometry,
        properties: (object.properties as Record<string, unknown>) ?? {},
      },
    ];
  }
  if (typeof object.type === 'string' && ('coordinates' in object || 'geometries' in object)) {
    return [{ geometry: object, properties: {} }];
  }
  return null;
}

function hasAltitude(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > 0 && typeof value[0] === 'number') return value.length > 2;
  return value.some(hasAltitude);
}

function positionsOutOfBounds(value: unknown): { swapped: boolean; position: number[] } | null {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    const [lon, lat] = value as number[];
    if (
      lon !== undefined &&
      lat !== undefined &&
      (lon < -180 || lon > 180 || lat < -90 || lat > 90)
    ) {
      // [lat, lon] order is the classic mistake: the swapped pair is valid.
      return { swapped: Math.abs(lat) <= 180 && Math.abs(lon) <= 90, position: [lon, lat] };
    }
    return null;
  }
  for (const item of value) {
    const found = positionsOutOfBounds(item);
    if (found) return found;
  }
  return null;
}

function geometryPositions(geometry: unknown): unknown {
  const object = (geometry ?? {}) as Record<string, unknown>;
  return object.type === 'GeometryCollection'
    ? ((object.geometries as unknown[]) ?? []).map(geometryPositions)
    : object.coordinates;
}

function readProperties(properties: Record<string, unknown>): ImportedProperties {
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  const name =
    text(properties.name) ??
    text(properties.nama) ??
    text(properties.NAME) ??
    text(properties.title);
  const code = text(properties.code);
  const kind = properties.kind;
  const buffer = Number(properties.bufferM ?? properties.buffer_m ?? properties.buffer);
  const source = text(properties.source);
  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(isZoneKind(kind) ? { kind } : {}),
    ...(Number.isFinite(buffer) && buffer >= 0 ? { bufferM: buffer } : {}),
    ...(source ? { source } : {}),
  };
}

/**
 * Reads a GeoJSON file for a zone: a Geometry, a Feature or a FeatureCollection (its features
 * are merged into one geometry, see `combineGeometries`). Checks the RFC 7946 structure with the
 * contracts schema and the WGS84 bounds (with a hint when latitude and longitude look swapped);
 * the kind rules, vertex limit and validity are checked by the editor and the service.
 */
export function parseGeoJsonText(text: string, byteLength = new Blob([text]).size): ImportResult {
  if (byteLength > IMPORT_MAX_BYTES) return { ok: false, error: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: 'invalid_json',
      detail: error instanceof Error ? error.message : undefined,
    };
  }
  const features = featuresOf(json);
  if (!features) return { ok: false, error: 'not_geojson' };
  const withGeometry = features.filter((feature) => feature.geometry);
  if (withGeometry.length === 0) return { ok: false, error: 'empty' };

  const geometries: GeoJsonGeometryDto[] = [];
  let droppedAltitude = false;
  for (const feature of withGeometry) {
    const raw = feature.geometry as Record<string, unknown>;
    if (
      raw.type === 'GeometryCollection' &&
      ((raw.geometries as unknown[]) ?? []).some(
        (member) => (member as Record<string, unknown>)?.type === 'GeometryCollection',
      )
    ) {
      return { ok: false, error: 'nested_collection' };
    }
    const outOfBounds = positionsOutOfBounds(geometryPositions(raw));
    if (outOfBounds) {
      return {
        ok: false,
        error: outOfBounds.swapped ? 'swapped_coordinates' : 'out_of_bounds',
        detail: `[${outOfBounds.position.join(', ')}]`,
      };
    }
    const parsed = GeoJsonGeometrySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        error: 'invalid_geometry',
        detail: issue ? `${issue.path.join('.') || 'geometry'}: ${issue.message}` : undefined,
      };
    }
    droppedAltitude ||= hasAltitude(geometryPositions(raw));
    geometries.push(parsed.data);
  }
  // Parts are re-combined (altitudes dropped): one part keeps its type, several of one type
  // become a Multi* geometry, mixed types a GeometryCollection.
  const combined = combineGeometries(geometries.flatMap((item) => splitGeometry(item)));
  if (!combined) return { ok: false, error: 'empty' };
  return {
    ok: true,
    geometry: combined,
    properties: readProperties(withGeometry[0]!.properties),
    featureCount: withGeometry.length,
    vertexCount: vertexCount(combined),
    droppedAltitude,
  };
}

/** A zone as a GeoJSON Feature (export): geometry plus the zone's fields and properties. */
export function zoneToFeature(zone: ZoneDto) {
  return {
    type: 'Feature' as const,
    id: zone.id,
    geometry: zone.geometry,
    properties: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      kind: zone.kind,
      bufferM: zone.bufferM,
      alertOnEnter: zone.alertOnEnter,
      active: zone.active,
      global: zone.global,
      orgId: zone.orgId,
      source: zone.source,
      updatedAt: zone.updatedAt,
      properties: zone.properties,
    },
  };
}

/** Triggers the download of GeoJSON data (`application/geo+json`). */
export function downloadGeoJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.geojson') ? fileName : `${fileName}.geojson`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Text of a chosen file: `Blob.text()`, or a `FileReader` where the engine lacks it. */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'));
    reader.readAsText(file);
  });
}
