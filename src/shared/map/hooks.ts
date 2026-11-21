import type { BBox } from '@darmawanweb/ais-its-contracts/domain';
import type { AddLayerObject, MapEventType, SourceSpecification } from 'maplibre-gl';
import { useEffect, useEffectEvent, useState } from 'react';

import { debounce } from '@/shared/lib/utils';

import { useMapContext } from './context';
import type { DeckLayerRegistration } from './layer-registry';

export interface MapViewport {
  /** [minLon, minLat, maxLon, maxLat] of the visible area. */
  bbox: BBox;
  zoom: number;
  /** [lon, lat] */
  center: [number, number];
  bearing: number;
}

function readViewport(map: ReturnType<typeof useMapContext>['map']): MapViewport {
  const bounds = map.getBounds();
  const center = map.getCenter();
  return {
    bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    zoom: map.getZoom(),
    center: [center.lng, center.lat],
    bearing: map.getBearing(),
  };
}

/** Visible bbox / zoom of the surrounding MapView, debounced after the map stops moving. */
export function useMapViewport(options: { debounceMs?: number } = {}): MapViewport {
  const { debounceMs = 250 } = options;
  const { map } = useMapContext();
  const [viewport, setViewport] = useState<MapViewport>(() => readViewport(map));
  useEffect(() => {
    const update = debounce(() => setViewport(readViewport(map)), debounceMs);
    map.on('moveend', update);
    map.on('resize', update);
    return () => {
      update.cancel();
      map.off('moveend', update);
      map.off('resize', update);
    };
  }, [map, debounceMs]);
  return viewport;
}

/**
 * Adds deck.gl layers to the surrounding MapView while mounted.
 *
 *   const layers = useMemo(() => [new GeoJsonLayer({ id: 'zones', data, … })], [data]);
 *   useDeckLayers('zones', layers, { order: 10 });
 */
export function useDeckLayers(
  id: string,
  layers: DeckLayerRegistration['layers'],
  options: { order?: number; getTooltip?: DeckLayerRegistration['getTooltip'] } = {},
): void {
  const { registry } = useMapContext();
  const { order = 50, getTooltip } = options;
  useEffect(() => {
    registry.setDeckLayers({ id, layers, order, getTooltip });
  }, [registry, id, layers, order, getTooltip]);
  useEffect(() => () => registry.removeDeckLayers(id), [registry, id]);
}

/**
 * Adds a MapLibre source and its style layers (kept across basemap switches). Pass a new
 * `source` object to update GeoJSON data; keep `layers` referentially stable (useMemo).
 */
export function useMapLibreLayers(
  id: string,
  source: SourceSpecification | null,
  layers: readonly AddLayerObject[],
  beforeId?: string,
): void {
  const { registry } = useMapContext();
  useEffect(() => {
    if (!source) {
      registry.removeMapLibreLayers(id);
      return;
    }
    registry.setMapLibreLayers({ id, source, layers, ...(beforeId ? { beforeId } : {}) });
  }, [registry, id, source, layers, beforeId]);
  useEffect(() => () => registry.removeMapLibreLayers(id), [registry, id]);
}

/** Listens to a MapLibre map event (click, mousemove, …) while mounted. */
export function useMapEvent<T extends keyof MapEventType>(
  type: T,
  handler: (event: MapEventType[T]) => void,
): void {
  const { map } = useMapContext();
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const listener = (event: MapEventType[T]) => onEvent(event);
    map.on(type, listener);
    return () => {
      map.off(type, listener);
    };
  }, [map, type]);
}
