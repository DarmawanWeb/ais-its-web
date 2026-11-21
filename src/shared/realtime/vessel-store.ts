import type { BBox } from '@darmawanweb/ais-its-contracts/domain';
import type {
  RealtimePosition,
  RealtimeSafetyState,
} from '@darmawanweb/ais-its-contracts/realtime';

/** Identity of a vessel known from REST (GET /api/v2/ais/latest → `vessel`). */
export interface VesselIdentity {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly typeCode?: string | null;
}

/** One record per vessel: latest position and latest safety state merged (spec §9). */
export interface VesselLiveRecord {
  readonly mmsi: number;
  /** Location of the most recent of position / safety state. */
  readonly lat: number;
  readonly lon: number;
  readonly position: RealtimePosition | null;
  readonly safety: RealtimeSafetyState | null;
  readonly vessel: VesselIdentity | null;
  /** Data time (ms since epoch) of the most recent of position / safety state. */
  readonly updatedAt: number;
}

/** A position with the optional vessel identity of the REST seed. */
export type SeedPosition = RealtimePosition & { readonly vessel?: VesselIdentity | null };

export const DEFAULT_STALE_AFTER_MS = 30 * 60_000;

function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function locate(
  position: RealtimePosition | null,
  safety: RealtimeSafetyState | null,
): { lat: number; lon: number; updatedAt: number } | null {
  const positionTime = position ? timeOf(position.time) : -1;
  const safetyTime = safety ? timeOf(safety.time) : -1;
  if (position && positionTime >= safetyTime) {
    return { lat: position.lat, lon: position.lon, updatedAt: Math.max(positionTime, safetyTime) };
  }
  if (safety)
    return { lat: safety.lat, lon: safety.lon, updatedAt: Math.max(positionTime, safetyTime) };
  return null;
}

export function inBBox(record: { lat: number; lon: number }, bbox: BBox, marginDeg = 0): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const latOk = record.lat >= minLat - marginDeg && record.lat <= maxLat + marginDeg;
  if (!latOk) return false;
  if (minLon <= maxLon) return record.lon >= minLon - marginDeg && record.lon <= maxLon + marginDeg;
  // bbox crossing the antimeridian
  return record.lon >= minLon - marginDeg || record.lon <= maxLon + marginDeg;
}

/**
 * Normalized live vessel store: a Map by MMSI that merges `positions` and `safety:states`
 * batches into one record per vessel, ignores out-of-order (older) messages and prunes
 * vessels without data for 30 minutes. Framework agnostic; React reads it through
 * useSyncExternalStore (see hooks.ts).
 */
export class VesselLiveStore {
  private readonly records = new Map<number, VesselLiveRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly vesselListeners = new Map<number, Set<() => void>>();
  private version = 0;
  private cache: { version: number; list: readonly VesselLiveRecord[] } | null = null;
  private readonly staleAfterMs: number;
  private readonly now: () => number;

  constructor(options: { staleAfterMs?: number; now?: () => number } = {}) {
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.records.size;
  }

  getVersion(): number {
    return this.version;
  }

  get(mmsi: number): VesselLiveRecord | undefined {
    return this.records.get(mmsi);
  }

  /** Merges positions (batch, single message or REST seed). Returns how many records changed. */
  upsertPositions(items: readonly SeedPosition[]): number {
    const changed: number[] = [];
    for (const item of items) {
      const current = this.records.get(item.mmsi);
      if (current?.position && timeOf(current.position.time) > timeOf(item.time)) continue;
      const { vessel: identity, ...positionFields } = item;
      const position: RealtimePosition = positionFields;
      const safety = current?.safety ?? null;
      const located = locate(position, safety);
      if (!located) continue;
      this.records.set(item.mmsi, {
        mmsi: item.mmsi,
        ...located,
        position,
        safety,
        vessel: identity ? { ...current?.vessel, ...identity } : (current?.vessel ?? null),
      });
      changed.push(item.mmsi);
    }
    this.commit(changed);
    return changed.length;
  }

  /** Merges safety states. Returns how many records changed. */
  upsertSafetyStates(items: readonly RealtimeSafetyState[]): number {
    const changed: number[] = [];
    for (const item of items) {
      const current = this.records.get(item.mmsi);
      if (current?.safety && timeOf(current.safety.time) > timeOf(item.time)) continue;
      const position = current?.position ?? null;
      const located = locate(position, item);
      if (!located) continue;
      this.records.set(item.mmsi, {
        mmsi: item.mmsi,
        ...located,
        position,
        safety: item,
        vessel: current?.vessel ?? null,
      });
      changed.push(item.mmsi);
    }
    this.commit(changed);
    return changed.length;
  }

  /** Removes vessels whose latest data is older than the stale window. Returns the count. */
  prune(now = this.now()): number {
    const removed: number[] = [];
    for (const [mmsi, record] of this.records) {
      if (now - record.updatedAt > this.staleAfterMs) {
        this.records.delete(mmsi);
        removed.push(mmsi);
      }
    }
    this.commit(removed);
    return removed.length;
  }

  clear(): void {
    const all = [...this.records.keys()];
    this.records.clear();
    this.commit(all);
  }

  /** All records (stable array until the next change). */
  snapshot(): readonly VesselLiveRecord[] {
    if (this.cache?.version !== this.version) {
      this.cache = { version: this.version, list: [...this.records.values()] };
    }
    return this.cache.list;
  }

  /** Records inside a bbox (with an optional margin in degrees). */
  inBBox(bbox: BBox, marginDeg = 0): VesselLiveRecord[] {
    return this.snapshot().filter((record) => inBBox(record, bbox, marginDeg));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeVessel(mmsi: number, listener: () => void): () => void {
    let set = this.vesselListeners.get(mmsi);
    if (!set) {
      set = new Set();
      this.vesselListeners.set(mmsi, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.vesselListeners.delete(mmsi);
    };
  }

  private commit(changed: readonly number[]): void {
    if (changed.length === 0) return;
    this.version += 1;
    for (const mmsi of changed) {
      const set = this.vesselListeners.get(mmsi);
      if (set) for (const listener of set) listener();
    }
    for (const listener of this.listeners) listener();
  }
}
