export type LonLat = [number, number];
export type BBoxTuple = [number, number, number, number];

/** Points with a known position (events, results, violations). */
export function withPosition<T extends { lat: number | null; lon: number | null }>(
  items: readonly T[],
): (T & { lat: number; lon: number })[] {
  return items.filter(
    (item): item is T & { lat: number; lon: number } =>
      typeof item.lat === 'number' &&
      typeof item.lon === 'number' &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lon),
  );
}

/**
 * Bounding box of positions grown by `padDeg` (at least `minSpanDeg` wide/high so one point
 * still gets a sensible view); `null` without positions.
 */
export function bboxOf(
  points: readonly LonLat[],
  { padDeg = 0.05, minSpanDeg = 0.2 }: { padDeg?: number; minSpanDeg?: number } = {},
): BBoxTuple | null {
  if (points.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const growLon = Math.max(0, (minSpanDeg - (maxLon - minLon)) / 2) + padDeg;
  const growLat = Math.max(0, (minSpanDeg - (maxLat - minLat)) / 2) + padDeg;
  return [
    Math.max(-180, minLon - growLon),
    Math.max(-85, minLat - growLat),
    Math.min(180, maxLon + growLon),
    Math.min(85, maxLat + growLat),
  ];
}

/**
 * Heatmap cell size for a map view (`cellKm` of `GET /surveillance/heatmap`, 0.5–500 km):
 * about 40 cells across the box, rounded to a "nice" value so small pans reuse the cache.
 */
export function heatmapCellKm(bbox: readonly number[] | null | undefined): number {
  if (!bbox || bbox.length !== 4) return 10;
  const [minLon = 0, minLat = 0, maxLon = 0, maxLat = 0] = bbox;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const widthKm = Math.abs(maxLon - minLon) * 111.32 * Math.max(0.1, Math.cos(midLat));
  const heightKm = Math.abs(maxLat - minLat) * 110.57;
  const raw = Math.max(widthKm, heightKm) / 40;
  const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  return nice.find((value) => value >= raw) ?? 500;
}

/** Rounds a viewport box outward to `stepDeg` so map pans do not refetch on every move. */
export function snapBBox(bbox: readonly number[], stepDeg = 0.5): BBoxTuple {
  const [minLon = -180, minLat = -85, maxLon = 180, maxLat = 85] = bbox;
  const down = (v: number) => Math.floor(v / stepDeg) * stepDeg;
  const up = (v: number) => Math.ceil(v / stepDeg) * stepDeg;
  return [
    Math.max(-180, down(minLon)),
    Math.max(-90, down(minLat)),
    Math.min(180, up(maxLon)),
    Math.min(90, up(maxLat)),
  ];
}

export function formatBBoxParam(bbox: readonly number[]): string {
  return bbox.map((value) => Number(value.toFixed(5))).join(',');
}
