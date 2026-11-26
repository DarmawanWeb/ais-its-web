import type { ZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import type {
  AddLayerObject,
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
} from 'maplibre-gl';

import { appConfig } from '@/shared/config/env';

/** Martin function source of the global active zones (geo service, `zones_tiles_mvt`). */
export const ZONES_TILE_SOURCE = 'zones_tiles_mvt';

/**
 * Zone colours of the map (MapLibre paint properties cannot read CSS variables). Pipelines are
 * orange (the emphasised infrastructure layer); no zone uses the safety ring colours.
 */
export const ZONE_KIND_COLORS: Readonly<Record<ZoneKind, string>> = {
  pipeline: '#fb923c',
  transhipment_area: '#a78bfa',
  fishing_ground: '#34d399',
  mpa: '#4ade80',
  restricted: '#f87171',
  anchorage: '#60a5fa',
  port: '#38bdf8',
  tss_lane: '#cbd5e1',
  shallow_water: '#22d3ee',
  custom: '#94a3b8',
};

const KIND_COLOR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'kind'],
  ...Object.entries(ZONE_KIND_COLORS).flat(),
  '#94a3b8',
] as unknown as ExpressionSpecification;

const IS_POLYGON: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['Polygon', 'MultiPolygon'],
  true,
  false,
];
const IS_LINE: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString'],
  true,
  false,
];
const IS_POINT: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['Point', 'MultiPoint'],
  true,
  false,
];
const IS_PIPELINE: ExpressionSpecification = ['==', ['get', 'kind'], 'pipeline'];
const NOT_PIPELINE: ExpressionSpecification = ['!', IS_PIPELINE];
const all = (...parts: ExpressionSpecification[]): FilterSpecification => ['all', ...parts];

/** Tile URL template of the Martin zones source behind the gateway (`/tiles`, spec §12). */
export function zonesTileUrl(origin = window.location.origin): string {
  const base = appConfig.tilesBaseUrl.replace(/\/$/, '');
  const absolute = /^https?:\/\//.test(base)
    ? base
    : `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
  return `${absolute}/${ZONES_TILE_SOURCE}/{z}/{x}/{y}`;
}

export interface ZoneLayerOptions {
  /** MapLibre source id (= registration id). */
  source: string;
  /** Vector tiles: the layer inside the tiles. */
  sourceLayer?: string;
  showZones: boolean;
  showPipelines: boolean;
  /** Organization zones: dashed outlines tell them apart from global zones. */
  dashed?: boolean;
}

/** MapLibre style layers of a zones source (fills, outlines, points, emphasised pipelines). */
export function zoneLayers({
  source,
  sourceLayer,
  showZones,
  showPipelines,
  dashed = false,
}: ZoneLayerOptions): AddLayerObject[] {
  const base = { source, ...(sourceLayer ? { 'source-layer': sourceLayer } : {}) };
  const layers: AddLayerObject[] = [];
  if (showZones) {
    layers.push(
      {
        id: `${source}-fill`,
        type: 'fill',
        ...base,
        filter: all(IS_POLYGON, NOT_PIPELINE),
        paint: { 'fill-color': KIND_COLOR, 'fill-opacity': 0.12 },
      },
      {
        id: `${source}-outline`,
        type: 'line',
        ...base,
        filter: all(IS_POLYGON, NOT_PIPELINE),
        paint: {
          'line-color': KIND_COLOR,
          'line-width': 1.4,
          'line-opacity': 0.9,
          ...(dashed ? { 'line-dasharray': [3, 2] } : {}),
        },
      },
      {
        id: `${source}-lines`,
        type: 'line',
        ...base,
        filter: all(IS_LINE, NOT_PIPELINE),
        paint: { 'line-color': KIND_COLOR, 'line-width': 1.6, 'line-dasharray': [4, 3] },
      },
      {
        id: `${source}-points`,
        type: 'circle',
        ...base,
        filter: IS_POINT,
        paint: {
          'circle-radius': 5,
          'circle-color': KIND_COLOR,
          'circle-opacity': 0.35,
          'circle-stroke-color': KIND_COLOR,
          'circle-stroke-width': 1.5,
        },
      },
    );
  }
  if (showPipelines) {
    layers.push(
      {
        id: `${source}-pipeline-glow`,
        type: 'line',
        ...base,
        filter: all(IS_LINE, IS_PIPELINE),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ZONE_KIND_COLORS.pipeline,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 12],
          'line-opacity': 0.22,
          'line-blur': 2,
        },
      },
      {
        id: `${source}-pipeline`,
        type: 'line',
        ...base,
        filter: all(IS_LINE, IS_PIPELINE),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ZONE_KIND_COLORS.pipeline,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 12, 3.5],
          ...(dashed ? { 'line-dasharray': [3, 1.5] } : {}),
        },
      },
    );
  }
  return layers;
}

/** Ids of the layers whose features the hover tooltip reports. */
export function zoneLayerIds(layers: readonly AddLayerObject[]): string[] {
  return layers.map((layer) => layer.id);
}

/**
 * Integer zoom and a bbox snapped outwards to a coarse grid (half a viewport), so the org
 * zones GeoJSON is refetched only after a real move or zoom change.
 */
export function zonesQueryArea(
  bbox: readonly [number, number, number, number],
  zoom: number,
): { bbox: string; zoom: number } {
  const z = Math.max(0, Math.min(18, Math.floor(zoom)));
  const step = Math.max(0.05, (360 / 2 ** z) * 0.5);
  const snap = (value: number, up: boolean) =>
    (up ? Math.ceil(value / step) : Math.floor(value / step)) * step;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const box = [
    Math.max(-180, snap(minLon, false)),
    Math.max(-90, snap(minLat, false)),
    Math.min(180, snap(maxLon, true)),
    Math.min(90, snap(maxLat, true)),
  ].map((value) => Number(value.toFixed(4)));
  return { bbox: box.join(','), zoom: z };
}
