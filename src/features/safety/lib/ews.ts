import type { EwsStatus } from '@darmawanweb/ais-its-contracts/domain';

import type { ZoneFeatureCollectionDto } from '@/shared/api/generated/geo/model';
import type { SafetyVesselStateDto } from '@/shared/api/generated/safety/model';

type ZoneFeatureCollectionLike = Pick<ZoneFeatureCollectionDto, 'features'>;

/** EWS statuses of the page filter: 0 danger, 1 warning, 3 safe (backend codes, spec §13.7). */
export const EWS_FILTER_STATUSES = [0, 1, 3] as const satisfies readonly EwsStatus[];

export const DEFAULT_EWS_FILTER: readonly EwsStatus[] = [0, 1];

/** `?status=0,1` → statuses (unknown values dropped; none → the default). */
export function parseEwsStatusParam(value: string | null): EwsStatus[] {
  if (!value) return [...DEFAULT_EWS_FILTER];
  const statuses = value
    .split(',')
    .map(Number)
    .filter((status): status is EwsStatus => status === 0 || status === 1 || status === 3);
  return statuses.length ? [...new Set(statuses)].sort() : [...DEFAULT_EWS_FILTER];
}

export function formatEwsStatusParam(statuses: readonly EwsStatus[]): string | null {
  const sorted = [...new Set(statuses)].sort();
  return sorted.join(',') === DEFAULT_EWS_FILTER.join(',') ? null : sorted.join(',');
}

const RANK: Record<number, number> = { 0: 0, 1: 1, 3: 2 };

/** Danger first, then warning, then safe; nearer to a pipeline first; unknown distances last. */
export function sortEwsStates<
  T extends Pick<SafetyVesselStateDto, 'ewsStatus' | 'pipelineDistanceM' | 'mmsi'>,
>(states: readonly T[]): T[] {
  return [...states].sort(
    (a, b) =>
      (RANK[a.ewsStatus] ?? 3) - (RANK[b.ewsStatus] ?? 3) ||
      (a.pipelineDistanceM ?? Number.POSITIVE_INFINITY) -
        (b.pipelineDistanceM ?? Number.POSITIVE_INFINITY) ||
      a.mmsi - b.mmsi,
  );
}

export function countByEwsStatus(
  states: readonly Pick<SafetyVesselStateDto, 'ewsStatus'>[],
): Record<'danger' | 'warning' | 'safe', number> {
  const counts = { danger: 0, warning: 0, safe: 0 };
  for (const state of states) {
    if (state.ewsStatus === 0) counts.danger += 1;
    else if (state.ewsStatus === 1) counts.warning += 1;
    else counts.safe += 1;
  }
  return counts;
}

/** Zone id → name of the pipelines (for the "nearest pipeline" column). */
export function pipelineNames(
  collection: ZoneFeatureCollectionLike | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const feature of collection?.features ?? []) {
    names.set(feature.id, feature.properties.name);
  }
  return names;
}

/** [[minLon, minLat], [maxLon, maxLat]] of the line pipelines, or null. */
export function pipelinesBounds(
  collection: ZoneFeatureCollectionLike | undefined,
): [[number, number], [number, number]] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const line of pipelinePaths(collection)) {
    for (const [lon, lat] of line.path) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

export interface PipelinePath {
  id: string;
  name: string;
  global: boolean;
  path: [number, number][];
}

/** Line parts of the pipeline features (LineString / MultiLineString), for deck PathLayers. */
export function pipelinePaths(collection: ZoneFeatureCollectionLike | undefined): PipelinePath[] {
  const paths: PipelinePath[] = [];
  for (const feature of collection?.features ?? []) {
    const { geometry } = feature;
    const coordinates = geometry.coordinates ?? [];
    const lines =
      geometry.type === 'LineString'
        ? [coordinates]
        : geometry.type === 'MultiLineString'
          ? (coordinates as unknown[][])
          : [];
    for (const line of lines) {
      const path: [number, number][] = [];
      for (const position of line) {
        if (!Array.isArray(position)) continue;
        const [lon, lat] = position as unknown[];
        if (typeof lon === 'number' && typeof lat === 'number') path.push([lon, lat]);
      }
      if (path.length >= 2) {
        paths.push({
          id: feature.id,
          name: feature.properties.name,
          global: feature.properties.global,
          path,
        });
      }
    }
  }
  return paths;
}

/** Structured facts of an EWS event (`data` written by the safety detector). */
export interface EwsEventFacts {
  distanceM: number;
  pipeline: string | null;
  /** 0 danger, 1 warning; null when the event does not say. */
  status: 0 | 1 | null;
  /** The threshold the distance crossed, metres. */
  thresholdM: number | null;
}

/**
 * Facts for a localized summary of an EWS event (the API's `message` is English only): the
 * distance, the pipeline name and the crossed threshold; null when `data` has no distance.
 */
export function ewsEventFacts(data: unknown): EwsEventFacts | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const distance = record.pipelineDistanceM;
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return null;
  const status = record.ewsStatus === 0 || record.ewsStatus === 1 ? record.ewsStatus : null;
  const thresholds =
    record.thresholds && typeof record.thresholds === 'object'
      ? (record.thresholds as Record<string, unknown>)
      : null;
  const threshold =
    status === 0 ? thresholds?.dangerM : status === 1 ? thresholds?.warningM : undefined;
  const pipeline = typeof record.zoneName === 'string' ? record.zoneName.trim() : '';
  return {
    distanceM: distance,
    pipeline: pipeline || null,
    status,
    thresholdM: typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : null,
  };
}
