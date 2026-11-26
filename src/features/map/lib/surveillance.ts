import type { Color } from '@deck.gl/core';

import type { EventsControllerList200 } from '@/shared/api/generated/surveillance/model';

type SurveillanceEventDto = EventsControllerList200['data'][number];
import type { Rgba } from '@/shared/theme/tokens';

/**
 * Markers of the surveillance events layer: a colour per type plus a letter, so the type never
 * depends on colour alone (the legend explains both).
 */
export const EVENT_TYPE_STYLE: Readonly<Record<string, { color: Rgba; letter: string }>> = {
  transhipment: { color: [167, 139, 250, 255], letter: 'T' },
  anomaly: { color: [34, 211, 238, 255], letter: 'A' },
  dark: { color: [148, 163, 184, 255], letter: 'D' },
  geofence: { color: [251, 113, 133, 255], letter: 'G' },
  fishing: { color: [52, 211, 153, 255], letter: 'F' },
  default: { color: [203, 213, 225, 255], letter: '?' },
};

/** Sequential palette of the fishing heatmap (one hue family, light → dark: yellow → red). */
export const HEATMAP_COLORS: Color[] = [
  [254, 240, 138, 60],
  [253, 224, 71, 140],
  [251, 191, 36, 180],
  [249, 115, 22, 210],
  [234, 88, 12, 230],
  [190, 18, 60, 245],
];

/** Heatmap cell size for a zoom: ~4 cells per 100 px (0.5–500 km, the API's limits). */
export function heatmapCellKm(zoom: number): number {
  const kmPerPixel = 40_075 / (512 * 2 ** Math.max(0, zoom));
  return Math.min(500, Math.max(0.5, Math.round(kmPerPixel * 24 * 2) / 2));
}

/** `minLon,minLat,maxLon,maxLat` snapped outwards to a grid of half a viewport (stable keys). */
export function snappedBbox(bbox: readonly [number, number, number, number], zoom: number): string {
  const step = Math.max(0.05, (360 / 2 ** Math.max(0, Math.floor(zoom))) * 0.5);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [
    Math.max(-180, Math.floor(minLon / step) * step),
    Math.max(-90, Math.floor(minLat / step) * step),
    Math.min(180, Math.ceil(maxLon / step) * step),
    Math.min(90, Math.ceil(maxLat / step) * step),
  ]
    .map((value) => Number(value.toFixed(4)))
    .join(',');
}

export interface EventMarker {
  event: SurveillanceEventDto;
  /** [lon, lat] */
  position: [number, number];
  style: { color: Rgba; letter: string };
}

function coordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Markers of the events of the selected types that have a location. (The surveillance
 * document types its nullable numbers as objects, so the values are checked at runtime.)
 */
export function eventMarkers(
  events: readonly SurveillanceEventDto[],
  types: ReadonlySet<string>,
): EventMarker[] {
  const markers: EventMarker[] = [];
  for (const event of events) {
    const lat = coordinate(event.lat);
    const lon = coordinate(event.lon);
    if (lat === null || lon === null || !types.has(event.type)) continue;
    const style = EVENT_TYPE_STYLE[event.type] ??
      EVENT_TYPE_STYLE.default ?? { color: [203, 213, 225, 255], letter: '?' };
    markers.push({ event, position: [lon, lat], style });
  }
  return markers;
}
