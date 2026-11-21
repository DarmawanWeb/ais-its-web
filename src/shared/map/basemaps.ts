import type { StyleSpecification } from 'maplibre-gl';

import { appConfig, type BasemapId } from '@/shared/config/env';

export const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const ESRI_ATTRIBUTION =
  'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export interface BasemapDefinition {
  id: BasemapId;
  /** i18n key of the label (common namespace). */
  labelKey: string;
  available: boolean;
}

/** Basemaps in switcher order; the vector style needs VITE_MAP_STYLE_URL. */
export function basemapDefinitions(): BasemapDefinition[] {
  return [
    { id: 'vector', labelKey: 'map.basemaps.vector', available: !!appConfig.mapStyleUrl },
    { id: 'osm', labelKey: 'map.basemaps.osm', available: true },
    { id: 'satellite', labelKey: 'map.basemaps.satellite', available: true },
  ];
}

/** The basemap to use: the preference when available, else the configured default, else OSM. */
export function resolveBasemap(preferred: BasemapId | null | undefined): BasemapId {
  const available = new Set(
    basemapDefinitions()
      .filter((b) => b.available)
      .map((b) => b.id),
  );
  if (preferred && available.has(preferred)) return preferred;
  const configured = appConfig.defaultBasemap;
  if (configured && available.has(configured)) return configured;
  return available.has('vector') ? 'vector' : 'osm';
}

function rasterStyle(
  id: string,
  tiles: string,
  attribution: string,
  options: { maxzoom: number; background: string; dark?: boolean },
): StyleSpecification {
  return {
    version: 8,
    name: id,
    sources: {
      [id]: {
        type: 'raster',
        tiles: [tiles],
        tileSize: 256,
        maxzoom: options.maxzoom,
        attribution,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': options.background } },
      {
        id: `${id}-tiles`,
        type: 'raster',
        source: id,
        paint: options.dark
          ? {
              // Inverts the light OSM tiles into a dark chart-like basemap.
              'raster-brightness-min': 1,
              'raster-brightness-max': 0.08,
              'raster-hue-rotate': 200,
              'raster-saturation': -0.55,
              'raster-contrast': 0.12,
            }
          : {},
      },
    ],
  };
}

/** MapLibre style (URL or inline spec) of a basemap for the current theme. */
export function basemapStyle(
  basemap: BasemapId,
  theme: 'dark' | 'light',
): string | StyleSpecification {
  const dark = theme === 'dark';
  switch (basemap) {
    case 'vector':
      if (appConfig.mapStyleUrl) {
        return !dark && appConfig.mapStyleLightUrl
          ? appConfig.mapStyleLightUrl
          : appConfig.mapStyleUrl;
      }
      return basemapStyle('osm', theme);
    case 'satellite':
      return rasterStyle('satellite', appConfig.satelliteTilesUrl, ESRI_ATTRIBUTION, {
        maxzoom: 19,
        background: '#0b1622',
      });
    case 'osm':
      return rasterStyle('osm', appConfig.osmTilesUrl, OSM_ATTRIBUTION, {
        maxzoom: 19,
        background: dark ? '#0d1a2b' : '#aad3df',
        dark,
      });
  }
}

/** Extra attribution of a basemap (vector styles from Stadia / OpenMapTiles). */
export function basemapAttribution(basemap: BasemapId): string | undefined {
  return basemap === 'vector' && appConfig.mapStyleUrl ? appConfig.mapStyleAttribution : undefined;
}
