import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

import { MapLayerRegistry } from './layer-registry';

/** A MapLibre map stand-in: a style that can be "busy" (tiles loading) and emits events. */
function fakeMap() {
  const sources = new Map<string, unknown>();
  const layers = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  let styleLoaded = false;
  const map = {
    isStyleLoaded: () => styleLoaded,
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, source: unknown) => {
      sources.set(id, { ...(source as object), setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    on: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    once: (type: string, fn: () => void) => {
      const wrapper = () => {
        listeners.get(type)?.delete(wrapper);
        fn();
      };
      map.on(type, wrapper);
    },
    off: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  };
  const emit = (type: string) => [...(listeners.get(type) ?? [])].forEach((fn) => fn());
  return {
    map,
    sources,
    layers,
    emit,
    setStyleLoaded: (value: boolean) => {
      styleLoaded = value;
    },
  };
}

const overlay = { setProps: vi.fn() } as unknown as MapboxOverlay;
const zones = {
  id: 'zones',
  source: { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } },
  layers: [{ id: 'zones-fill', type: 'fill' as const, source: 'zones' }],
};

describe('MapLayerRegistry (MapLibre layers)', () => {
  it('adds layers at once when the style is ready', () => {
    const fake = fakeMap();
    fake.setStyleLoaded(true);
    const registry = new MapLayerRegistry(fake.map as unknown as MapLibreMap, overlay);
    registry.setMapLibreLayers(zones);
    expect(fake.sources.has('zones')).toBe(true);
    expect(fake.layers.has('zones-fill')).toBe(true);
  });

  it('applies a registration made while tiles load once the map is idle', () => {
    const fake = fakeMap();
    const registry = new MapLayerRegistry(fake.map as unknown as MapLibreMap, overlay);
    registry.setMapLibreLayers(zones); // style busy: deferred, not dropped
    expect(fake.sources.has('zones')).toBe(false);
    fake.setStyleLoaded(true);
    fake.emit('idle');
    expect(fake.sources.has('zones')).toBe(true);
    expect(fake.layers.has('zones-fill')).toBe(true);
  });

  it('removes a deferred registration that was dropped before the map became idle', () => {
    const fake = fakeMap();
    const registry = new MapLayerRegistry(fake.map as unknown as MapLibreMap, overlay);
    registry.setMapLibreLayers(zones);
    registry.removeMapLibreLayers('zones');
    fake.setStyleLoaded(true);
    fake.emit('idle');
    expect(fake.sources.has('zones')).toBe(false);
  });

  it('updates GeoJSON data in place and re-adds everything after a basemap switch', () => {
    const fake = fakeMap();
    fake.setStyleLoaded(true);
    const registry = new MapLayerRegistry(fake.map as unknown as MapLibreMap, overlay);
    registry.setMapLibreLayers(zones);
    const source = fake.sources.get('zones') as { setData: ReturnType<typeof vi.fn> };
    const data = { type: 'FeatureCollection' as const, features: [] };
    registry.setMapLibreLayers({ ...zones, source: { type: 'geojson', data } });
    expect(source.setData).toHaveBeenCalledWith(data);
    expect(fake.map.addSource).toHaveBeenCalledTimes(1);
    // a new style has none of the sources
    fake.sources.clear();
    fake.layers.clear();
    fake.emit('style.load');
    expect(fake.sources.has('zones')).toBe(true);
    expect(fake.layers.has('zones-fill')).toBe(true);
  });
});
