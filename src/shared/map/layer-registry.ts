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
  /** Registrations currently added to the style (what `maplibre` held when last applied). */
  private readonly applied = new Map<string, MapLibreLayerRegistration>();
  /** Ids changed while the style was busy; applied when the map is idle. */
  private readonly pending = new Set<string>();
  private waitingForIdle = false;
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
    this.map.off('idle', this.flushPending);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.deck.clear();
    this.maplibre.clear();
    this.applied.clear();
    this.pending.clear();
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
    this.maplibre.set(registration.id, registration);
    this.syncWhenReady(registration.id);
  }

  removeMapLibreLayers(id: string): void {
    if (!this.maplibre.delete(id) && !this.applied.has(id)) return;
    this.syncWhenReady(id);
  }

  /**
   * `isStyleLoaded()` is false until the style is parsed and also while any source still loads
   * tiles: a change made then is applied when the map is idle (or on the next `style.load`),
   * never dropped.
   */
  private syncWhenReady(id: string): void {
    if (this.map.isStyleLoaded()) {
      this.pending.delete(id);
      this.sync(id);
      return;
    }
    this.pending.add(id);
    if (this.waitingForIdle) return;
    this.waitingForIdle = true;
    this.map.once('idle', this.flushPending);
  }

  private readonly flushPending = (): void => {
    this.waitingForIdle = false;
    const ids = [...this.pending];
    this.pending.clear();
    for (const id of ids) this.syncWhenReady(id);
  };

  /** Brings the style in line with the registration of `id` (added, updated or removed). */
  private sync(id: string): void {
    const registration = this.maplibre.get(id);
    const previous = this.applied.get(id);
    try {
      if (!registration) {
        if (previous) this.removeFromStyle(previous);
        this.applied.delete(id);
        return;
      }
      const source = this.map.getSource(id);
      const sameLayers =
        previous &&
        previous.layers === registration.layers &&
        previous.beforeId === registration.beforeId;
      if (source && sameLayers && previous.source === registration.source) {
        this.addToStyle(registration); // already applied; re-adds missing layers only
      } else if (source && sameLayers && registration.source.type === 'geojson') {
        // Data-only update: no flicker.
        void (source as GeoJSONSource).setData(registration.source.data);
      } else {
        if (previous) this.removeFromStyle(previous);
        this.addToStyle(registration);
      }
      this.applied.set(id, registration);
    } catch (error) {
      console.error(`[map] could not apply layers of "${id}"`, error);
    }
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

  /** A new basemap style has none of the registered sources: add every registration again. */
  private readonly reapplyMapLibre = (): void => {
    this.applied.clear();
    this.pending.clear();
    for (const registration of this.maplibre.values()) {
      try {
        this.addToStyle(registration);
        this.applied.set(registration.id, registration);
      } catch (error) {
        console.error(`[map] could not add layers of "${registration.id}"`, error);
      }
    }
  };
}
