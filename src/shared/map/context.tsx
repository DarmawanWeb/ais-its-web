import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { createContext, useContext } from 'react';

import type { BasemapId } from '@/shared/config/env';

import type { MapLayerRegistry } from './layer-registry';

export interface MapContextValue {
  map: MapLibreMap;
  overlay: MapboxOverlay;
  registry: MapLayerRegistry;
  basemap: BasemapId;
  setBasemap: (basemap: BasemapId) => void;
}

export const MapContext = createContext<MapContextValue | null>(null);

/** The surrounding MapView (map instance, deck overlay, layer registry). */
export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) throw new Error('useMapContext must be used inside <MapView>');
  return context;
}

/** Same as useMapContext but returns null outside a MapView. */
export function useOptionalMapContext(): MapContextValue | null {
  return useContext(MapContext);
}
