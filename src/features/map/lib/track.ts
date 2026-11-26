import type {
  PositionsControllerTrackParams,
  TrackPointDto,
} from '@/shared/api/generated/ais-processor/model';

/** Track ranges of the vessel panel (hours back from now). */
export const TRACK_RANGES = { '1h': 1, '6h': 6, '24h': 24, '3d': 72, '7d': 168 } as const;
export type TrackRange = keyof typeof TRACK_RANGES;

/**
 * Request of `GET /ais/vessels/:mmsi/track`: raw positions up to 24 h, the 1-minute aggregate
 * beyond (raw is limited to 7 days and gets heavy), Douglas–Peucker simplification on long
 * ranges (`geo.track_simplification`). `now` is rounded to the minute so the query key is stable.
 */
export function trackParams(
  range: TrackRange,
  anchor = Date.now(),
): PositionsControllerTrackParams {
  const end = Math.ceil(anchor / 60_000) * 60_000;
  const hours = TRACK_RANGES[range];
  const params: PositionsControllerTrackParams = {
    from: new Date(end - hours * 3_600_000).toISOString(),
    to: new Date(end).toISOString(),
    resolution: hours > 24 ? '1m' : 'raw',
  };
  if (hours > 24) params.simplify = 25;
  return params;
}

export interface TrackSample {
  time: number;
  lon: number;
  lat: number;
  cog: number;
  sog: number;
}

/** Points with valid times, oldest first. */
export function trackSamples(points: readonly TrackPointDto[]): TrackSample[] {
  return points
    .map((point) => ({
      time: Date.parse(point.time),
      lon: point.lon,
      lat: point.lat,
      cog: point.cog,
      sog: point.sog,
    }))
    .filter((sample) => Number.isFinite(sample.time))
    .sort((a, b) => a.time - b.time);
}

/** Interpolated position at `time` (clamped to the track), or null for an empty track. */
export function positionAt(samples: readonly TrackSample[], time: number): TrackSample | null {
  if (samples.length === 0) return null;
  const first = samples[0] as TrackSample;
  const last = samples[samples.length - 1] as TrackSample;
  if (time <= first.time) return first;
  if (time >= last.time) return last;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((samples[middle] as TrackSample).time <= time) low = middle;
    else high = middle;
  }
  const a = samples[low] as TrackSample;
  const b = samples[high] as TrackSample;
  const f = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
  return {
    time,
    lon: a.lon + (b.lon - a.lon) * f,
    lat: a.lat + (b.lat - a.lat) * f,
    cog: f < 0.5 ? a.cog : b.cog,
    sog: a.sog + (b.sog - a.sog) * f,
  };
}

/** Index of the last sample at or before `time` (for the played part of the path). */
export function playedCount(samples: readonly TrackSample[], time: number): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((samples[middle] as TrackSample).time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Great-circle length of the track, nautical miles (haversine, R = 3 440.065 nm). */
export function trackLengthNm(samples: readonly TrackSample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] as TrackSample;
    const b = samples[i] as TrackSample;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    total += 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}
