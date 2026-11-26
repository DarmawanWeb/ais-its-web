import type { PairTrackDto, TrackDto } from '@/shared/api/generated/ais-processor/model';

/** One vessel's track prepared for replay (deck.gl TripsLayer: path + timestamps). */
export interface ReplayTrack {
  mmsi: number;
  /** [lon, lat] positions in time order. */
  path: [number, number][];
  /** Epoch ms of each position. */
  timestamps: number[];
  sog: number[];
}

export interface Replay {
  tracks: ReplayTrack[];
  /** Earliest and latest fix of both tracks, epoch ms. */
  start: number;
  end: number;
}

function prepareTrack(track: TrackDto): ReplayTrack {
  const points = [...track.points]
    .map((point) => ({ ...point, t: Date.parse(point.time) }))
    .filter(
      (point) =>
        Number.isFinite(point.t) && Number.isFinite(point.lat) && Number.isFinite(point.lon),
    )
    .sort((a, b) => a.t - b.t);
  return {
    mmsi: track.mmsi,
    path: points.map((point) => [point.lon, point.lat]),
    timestamps: points.map((point) => point.t),
    sog: points.map((point) => point.sog),
  };
}

/** Sorts and cleans the pair track of `GET /ais/pairs/track`; `null` without any fix. */
export function prepareReplay(pair: PairTrackDto | undefined): Replay | null {
  if (!pair) return null;
  const tracks = pair.tracks.map(prepareTrack).filter((track) => track.path.length > 0);
  if (tracks.length === 0) return null;
  const start = Math.min(...tracks.map((track) => track.timestamps[0] ?? Infinity));
  const end = Math.max(...tracks.map((track) => track.timestamps.at(-1) ?? -Infinity));
  return { tracks, start, end };
}

/**
 * Position of a vessel at time `t` (epoch ms): linear interpolation between the surrounding
 * fixes (the transhipment analysis interpolates the same way, `transhipment.route_interpolation`);
 * `null` before the first or after the last fix.
 */
export function positionAt(track: ReplayTrack, t: number): [number, number] | null {
  const { timestamps, path } = track;
  const first = timestamps[0];
  const last = timestamps.at(-1);
  if (first === undefined || last === undefined || t < first || t > last) return null;
  let low = 0;
  let high = timestamps.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((timestamps[mid] ?? 0) <= t) low = mid;
    else high = mid;
  }
  const t0 = timestamps[low] ?? t;
  const t1 = timestamps[high] ?? t;
  const p0 = path[low];
  const p1 = path[high];
  if (!p0 || !p1) return null;
  if (t1 === t0) return p0;
  const f = (t - t0) / (t1 - t0);
  return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
}

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Great-circle distance in metres (haversine, mean Earth radius; `geo.haversine_distance`).
 * Display only: the detector's scoring keeps the legacy constant (R = 3438 nm).
 */
export function distanceM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance between the two vessels at `t`, `null` when one of them has no fix around `t`. */
export function pairDistanceAt(replay: Replay, t: number): number | null {
  const [a, b] = replay.tracks;
  if (!a || !b) return null;
  const pa = positionAt(a, t);
  const pb = positionAt(b, t);
  return pa && pb ? distanceM(pa, pb) : null;
}

/** Closest approach of the pair, sampled every `stepMs` over the common time span. */
export function closestApproach(
  replay: Replay,
  stepMs = 30_000,
): { t: number; distanceM: number } | null {
  const [a, b] = replay.tracks;
  if (!a || !b) return null;
  const from = Math.max(a.timestamps[0] ?? Infinity, b.timestamps[0] ?? Infinity);
  const to = Math.min(a.timestamps.at(-1) ?? -Infinity, b.timestamps.at(-1) ?? -Infinity);
  if (!(to >= from)) return null;
  let best: { t: number; distanceM: number } | null = null;
  for (let t = from; t <= to; t += Math.max(1_000, stepMs)) {
    const d = pairDistanceAt(replay, t);
    if (d !== null && (best === null || d < best.distanceM)) best = { t, distanceM: d };
  }
  return best;
}

/** Window shown around a transhipment: the analysed window plus a margin on both sides. */
export function replayWindow(
  startIso: string,
  endIso: string,
  marginMs = 30 * 60_000,
): { from: string; to: string } {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return {
    from: new Date(start - marginMs).toISOString(),
    to: new Date(Math.max(end, start) + marginMs).toISOString(),
  };
}
