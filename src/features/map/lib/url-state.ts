import { AIS_SOURCES, type AisSource } from '@darmawanweb/ais-its-contracts/domain';

/** Toggleable layers of the live map (the `layers` URL parameter). */
export const MAP_LAYER_KEYS = [
  'vessels',
  'zones',
  'pipelines',
  'encounters',
  'events',
  'heatmap',
] as const;
export type MapLayerKey = (typeof MAP_LAYER_KEYS)[number];

export const DEFAULT_LAYERS: readonly MapLayerKey[] = [
  'vessels',
  'zones',
  'pipelines',
  'encounters',
];

/**
 * Shareable state of the live map: `/map?lat=1.14324&lon=103.85641&z=9.5&vessel=525005223&
 * layers=vessels,zones&src=primary,batam` (defaults are omitted).
 */
export interface MapUrlState {
  /** [lon, lat] */
  center: [number, number] | null;
  zoom: number | null;
  vessel: number | null;
  layers: MapLayerKey[];
  /** AIS feeds shown (all when the parameter is absent). */
  sources: AisSource[];
}

function finiteIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function listOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  if (value === null) return [...fallback];
  if (value === '') return [];
  const items = value
    .split(',')
    .filter((item): item is T => (allowed as readonly string[]).includes(item));
  return allowed.filter((item) => items.includes(item));
}

export function parseMapUrl(params: URLSearchParams): MapUrlState {
  const lat = finiteIn(params.get('lat'), -85, 85);
  const lon = finiteIn(params.get('lon'), -180, 180);
  const vessel = params.get('vessel');
  return {
    center: lat !== null && lon !== null ? [lon, lat] : null,
    zoom: finiteIn(params.get('z'), 0, 22),
    vessel: vessel && /^\d{9}$/.test(vessel) ? Number(vessel) : null,
    layers: listOf(params.get('layers'), MAP_LAYER_KEYS, DEFAULT_LAYERS),
    sources: listOf(params.get('src'), AIS_SOURCES, AIS_SOURCES),
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/** Writes the given parts into a copy of `base` (defaults omitted, other params kept). */
export function writeMapUrl(state: Partial<MapUrlState>, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  if ('center' in state) {
    if (state.center) {
      next.set('lat', state.center[1].toFixed(5));
      next.set('lon', state.center[0].toFixed(5));
    } else {
      next.delete('lat');
      next.delete('lon');
    }
  }
  if ('zoom' in state) {
    if (state.zoom === null || state.zoom === undefined) next.delete('z');
    else next.set('z', String(Math.round(state.zoom * 100) / 100));
  }
  if ('vessel' in state) {
    if (state.vessel === null || state.vessel === undefined) next.delete('vessel');
    else next.set('vessel', String(state.vessel));
  }
  if (state.layers) {
    if (sameSet(state.layers, DEFAULT_LAYERS)) next.delete('layers');
    else next.set('layers', MAP_LAYER_KEYS.filter((key) => state.layers?.includes(key)).join(','));
  }
  if (state.sources) {
    if (sameSet(state.sources, AIS_SOURCES)) next.delete('src');
    else next.set('src', AIS_SOURCES.filter((source) => state.sources?.includes(source)).join(','));
  }
  return next;
}
