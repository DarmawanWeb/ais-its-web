import { AIS_SOURCES, type AisSource } from '@darmawanweb/ais-its-contracts/domain';
import { create } from 'zustand';

import type { VesselIconName } from '@/shared/map/vessel-icons';

import type { TrackRange } from '../lib/track';
import { DEFAULT_LAYERS, type MapLayerKey, type MapUrlState } from '../lib/url-state';
import { EMPTY_STATS, sameStats, type SafetyClass, type VesselStats } from '../lib/vessel-filters';

export type MapHover =
  | { kind: 'vessel'; mmsi: number; x: number; y: number }
  | { kind: 'zone'; name: string; zoneKind: string; global: boolean; x: number; y: number }
  | null;

/** Surveillance event types of the events layer (contracts ALERT_TYPES of that domain). */
export const SURVEILLANCE_EVENT_TYPES = [
  'transhipment',
  'anomaly',
  'dark',
  'geofence',
  'fishing',
] as const;

export interface TrackState {
  enabled: boolean;
  range: TrackRange;
  /** End of the requested range (ms, rounded to the minute): fixed while the track is shown. */
  anchor: number;
  /** Playback time (ms); null = the end of the track. */
  time: number | null;
  playing: boolean;
  /** Seconds of track per second of playback. */
  speed: number;
}

export interface FlyToRequest {
  id: number;
  /** [lon, lat] */
  center: [number, number];
  zoom?: number;
}

interface LiveMapState {
  layers: ReadonlySet<MapLayerKey>;
  sources: ReadonlySet<AisSource>;
  categories: ReadonlySet<VesselIconName> | null;
  navstatus: ReadonlySet<number> | null;
  safety: ReadonlySet<SafetyClass> | null;
  selectedMmsi: number | null;
  eventTypes: ReadonlySet<string>;
  hover: MapHover;
  /** Vessels drawn (after the filters) and their safety counts. */
  stats: VesselStats;
  /** Vessels in the viewport before the filters. */
  inView: number;
  zoom: number;
  track: TrackState;
  flyTo: FlyToRequest | null;
  /** Org zones truncated by the geo service budgets (notice in the layer panel). */
  zonesTruncated: boolean;

  initFromUrl: (state: MapUrlState) => void;
  toggleLayer: (key: MapLayerKey, on?: boolean) => void;
  toggleSource: (source: AisSource) => void;
  setCategories: (value: ReadonlySet<VesselIconName> | null) => void;
  setNavstatus: (value: ReadonlySet<number> | null) => void;
  setSafety: (value: ReadonlySet<SafetyClass> | null) => void;
  toggleEventType: (type: string) => void;
  resetFilters: () => void;
  select: (mmsi: number | null) => void;
  setHover: (hover: MapHover) => void;
  setStats: (stats: VesselStats, inView: number, zoom: number) => void;
  setTrack: (patch: Partial<TrackState>) => void;
  requestFlyTo: (center: [number, number], zoom?: number) => void;
  setZonesTruncated: (value: boolean) => void;
}

const minute = () => Math.ceil(Date.now() / 60_000) * 60_000;
const defaultTrack = (range: TrackRange = '6h'): TrackState => ({
  enabled: false,
  range,
  anchor: minute(),
  time: null,
  playing: false,
  speed: 120,
});

let flyToId = 0;

/** UI state of the live map page (filters, layers, selection, hover, track playback). */
export const useLiveMapStore = create<LiveMapState>()((set, get) => ({
  layers: new Set(DEFAULT_LAYERS),
  sources: new Set(AIS_SOURCES),
  categories: null,
  navstatus: null,
  safety: null,
  selectedMmsi: null,
  eventTypes: new Set(SURVEILLANCE_EVENT_TYPES),
  hover: null,
  stats: EMPTY_STATS,
  inView: 0,
  zoom: 0,
  track: defaultTrack(),
  flyTo: null,
  zonesTruncated: false,

  initFromUrl: (state) =>
    set({
      layers: new Set(state.layers),
      sources: new Set(state.sources),
      categories: null,
      navstatus: null,
      safety: null,
      selectedMmsi: state.vessel,
      eventTypes: new Set(SURVEILLANCE_EVENT_TYPES),
      hover: null,
      stats: EMPTY_STATS,
      inView: 0,
      track: defaultTrack(),
      flyTo: null,
      zonesTruncated: false,
    }),
  toggleLayer: (key, on) => {
    const layers = new Set(get().layers);
    const next = on ?? !layers.has(key);
    if (next) layers.add(key);
    else layers.delete(key);
    set({ layers });
  },
  toggleSource: (source) => {
    const sources = new Set(get().sources);
    if (sources.has(source)) sources.delete(source);
    else sources.add(source);
    set({ sources });
  },
  setCategories: (categories) => set({ categories }),
  setNavstatus: (navstatus) => set({ navstatus }),
  setSafety: (safety) => set({ safety }),
  toggleEventType: (type) => {
    const eventTypes = new Set(get().eventTypes);
    if (eventTypes.has(type)) eventTypes.delete(type);
    else eventTypes.add(type);
    set({ eventTypes });
  },
  resetFilters: () =>
    set({ categories: null, navstatus: null, safety: null, sources: new Set(AIS_SOURCES) }),
  select: (selectedMmsi) =>
    set((state) =>
      state.selectedMmsi === selectedMmsi
        ? {}
        : { selectedMmsi, track: defaultTrack(state.track.range) },
    ),
  setHover: (hover) => {
    const current = get().hover;
    if (current === hover) return;
    if (
      current &&
      hover &&
      current.kind === hover.kind &&
      current.x === hover.x &&
      current.y === hover.y
    )
      return;
    set({ hover });
  },
  setStats: (stats, inView, zoom) => {
    const state = get();
    if (sameStats(state.stats, stats) && state.inView === inView && state.zoom === zoom) return;
    set({ stats, inView, zoom });
  },
  setTrack: (patch) =>
    set((state) => {
      // A new range or showing the track again re-anchors the request at the current minute.
      const reanchor =
        (patch.range && patch.range !== state.track.range) ||
        (patch.enabled && !state.track.enabled);
      return {
        track: { ...state.track, ...patch, ...(reanchor ? { anchor: minute(), time: null } : {}) },
      };
    }),
  requestFlyTo: (center, zoom) => {
    flyToId += 1;
    set({ flyTo: { id: flyToId, center, ...(zoom !== undefined ? { zoom } : {}) } });
  },
  setZonesTruncated: (zonesTruncated) => {
    if (get().zonesTruncated !== zonesTruncated) set({ zonesTruncated });
  },
}));
