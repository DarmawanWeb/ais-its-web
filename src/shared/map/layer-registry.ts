import type { Layer, PickingInfo } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type {
  AddLayerObject,
  GeoJSONSource,
  Map as MapLibreMap,
  SourceSpecification,
} from 'maplibre-gl';

/** Tooltip content returned by a registered layer (deck.gl getTooltip format). */
export type MapTooltip =
  | string
  | { html?: string; text?: string; className?: string; style?: Partial<CSSStyleDeclaration> }
  | null;

export interface DeckLayerRegistration {
  /** Unique registration id (usually the deck layer id). */
  id: string;
  /** One layer, several layers, or null to hide. */
  layers: Layer | readonly (Layer | null | false | undefined)[] | null;
  /** Draw order: higher is drawn on top. Vessels use 100; zones ~10; heatmaps ~5. */
  order: number;
  /** Tooltip for picked objects of these layers. */
  getTooltip?: (info: PickingInfo) => MapTooltip;
}

export interface MapLibreLayerRegistration {
  /** Source id; the layers reference it. */
  id: string;
  source: SourceSpecification;
  /** MapLibre style layers using `source: id`. */
  layers: readonly AddLayerObject[];
  /** Insert the layers before this style layer id (e.g. under labels). */
  beforeId?: string;
}

/**
 * Collects the layers that features add to a MapView:
 *  - deck.gl layers (drawn by the MapboxOverlay, kept across basemap switches);
 *  - MapLibre sources + style layers (re-added after every basemap switch).
 * Feature code uses the hooks in hooks.ts (useDeckLayers, useMapLibreLayers).
 */
export class MapLayerRegistry {
  private readonly deck = new Map<string, DeckLayerRegistration>();
  private readonly maplibre = new Map<string, MapLibreLayerRegistration>();
  private frame: number | null = null;
  private readonly map: MapLibreMap;
  private readonly overlay: MapboxOverlay;

  constructor(map: MapLibreMap, overlay: MapboxOverlay) {
    this.map = map;
    this.overlay = overlay;
    map.on('style.load', this.reapplyMapLibre);
  }

  dispose(): void {
    this.map.off('style.load', this.reapplyMapLibre);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.deck.clear();
    this.maplibre.clear();
  }

  setDeckLayers(registration: DeckLayerRegistration): void {
    this.deck.set(registration.id, registration);
    this.scheduleDeck();
  }

  removeDeckLayers(id: string): void {
    if (this.deck.delete(id)) this.scheduleDeck();
  }

  /** Tooltip of the registration that owns the picked layer (sub-layer ids share the prefix). */
  tooltip(info: PickingInfo): MapTooltip {
    const layerId = info.layer?.id;
    if (!layerId || info.index < 0) return null;
    for (const registration of this.deck.values()) {
      if (!registration.getTooltip) continue;
      const owned = this.layerIds(registration).some(
        (id) => layerId === id || layerId.startsWith(`${id}-`),
      );
      if (owned) return registration.getTooltip(info);
    }
    return null;
  }

  private layerIds(registration: DeckLayerRegistration): string[] {
    const layers = registration.layers;
    if (!layers) return [];
    const list = Array.isArray(layers) ? layers : [layers];
    return list.flatMap((layer) => (layer ? [(layer as Layer).id] : []));
  }

  private scheduleDeck(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const layers = [...this.deck.values()]
        .sort((a, b) => a.order - b.order)
        .flatMap((registration) => {
          const value = registration.layers;
          if (!value) return [];
          return (Array.isArray(value) ? value : [value]).filter(Boolean) as Layer[];
        });
      this.overlay.setProps({ layers });
    });
  }

  setMapLibreLayers(registration: MapLibreLayerRegistration): void {
    const previous = this.maplibre.get(registration.id);
    this.maplibre.set(registration.id, registration);
    if (!this.map.isStyleLoaded()) return; // added on style.load
    const source = this.map.getSource(registration.id);
    const sameLayers =
      previous &&
      previous.layers === registration.layers &&
      previous.beforeId === registration.beforeId;
    if (
      source &&
      sameLayers &&
      registration.source.type === 'geojson' &&
      previous?.source !== registration.source
    ) {
      // Data-only update: no flicker.
      void (source as GeoJSONSource).setData(registration.source.data);
      return;
    }
    if (previous) this.removeFromStyle(previous);
    this.addToStyle(registration);
  }

  removeMapLibreLayers(id: string): void {
    const registration = this.maplibre.get(id);
    if (!registration) return;
    this.maplibre.delete(id);
    if (this.map.isStyleLoaded()) this.removeFromStyle(registration);
  }

  private addToStyle(registration: MapLibreLayerRegistration): void {
    if (!this.map.getSource(registration.id))
      this.map.addSource(registration.id, registration.source);
    for (const layer of registration.layers) {
      if (this.map.getLayer(layer.id)) continue;
      const beforeId =
        registration.beforeId && this.map.getLayer(registration.beforeId)
          ? registration.beforeId
          : undefined;
      this.map.addLayer(layer, beforeId);
    }
  }

  private removeFromStyle(registration: MapLibreLayerRegistration): void {
    for (const layer of registration.layers) {
      if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
    }
    if (this.map.getSource(registration.id)) this.map.removeSource(registration.id);
  }

  private readonly reapplyMapLibre = (): void => {
    for (const registration of this.maplibre.values()) {
      try {
        this.addToStyle(registration);
      } catch (error) {
        console.error(`[map] could not add layers of "${registration.id}"`, error);
      }
    }
  };
}
