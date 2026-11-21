import { type BBox, formatBBox } from '@darmawanweb/ais-its-contracts/domain';
import type { RealtimeSafetyState } from '@darmawanweb/ais-its-contracts/realtime';

import { http } from '@/shared/api/http';

import { isRealtimePosition, isRealtimeSafetyState } from './guards';
import type { VesselLiveStore } from './vessel-store';

/*
 * Initial state comes from REST (spec §9): GET /api/v2/ais/latest?bbox=… and
 * GET /api/v2/safety/vessels?bbox=…; the socket then streams deltas. Failures are tolerated
 * (the service may not be deployed yet) — the socket fills the store anyway.
 */
function listOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const wrapped = (data as { data?: unknown; items?: unknown } | null) ?? null;
  if (Array.isArray(wrapped?.data)) return wrapped.data;
  if (Array.isArray(wrapped?.items)) return wrapped.items;
  return [];
}

/** Safety states from REST may lack coordinates: place them at the vessel's known position. */
function locateSafety(store: VesselLiveStore, items: unknown[]): RealtimeSafetyState[] {
  return items.flatMap((item) => {
    if (isRealtimeSafetyState(item)) return [item];
    const record = item as Partial<RealtimeSafetyState> | null;
    const known = typeof record?.mmsi === 'number' ? store.get(record.mmsi) : undefined;
    if (!known || !record) return [];
    const located = { ...record, lat: known.lat, lon: known.lon };
    return isRealtimeSafetyState(located) ? [located] : [];
  });
}

function debug(message: string, error: unknown): void {
  if (import.meta.env.DEV) console.info(`[realtime] ${message}`, error);
}

export async function seedViewport(
  store: VesselLiveStore,
  bbox: BBox,
  signal?: AbortSignal,
): Promise<void> {
  const params = { bbox: formatBBox(bbox) };
  const [latest, safety] = await Promise.allSettled([
    http.get<unknown>('/api/v2/ais/latest', { params: { ...params, limit: 5000 }, signal }),
    http.get<unknown>('/api/v2/safety/vessels', { params, signal }),
  ]);
  if (signal?.aborted) return;
  if (latest.status === 'fulfilled') {
    store.upsertPositions(listOf(latest.value.data).filter(isRealtimePosition));
  } else debug('GET /ais/latest failed', latest.reason);
  if (safety.status === 'fulfilled') {
    store.upsertSafetyStates(locateSafety(store, listOf(safety.value.data)));
  } else debug('GET /safety/vessels failed', safety.reason);
}

export async function seedVessel(
  store: VesselLiveStore,
  mmsi: number,
  signal?: AbortSignal,
): Promise<void> {
  const [latest, safety] = await Promise.allSettled([
    http.get<unknown>(`/api/v2/ais/vessels/${mmsi}/latest`, { signal }),
    http.get<unknown>(`/api/v2/safety/vessels/${mmsi}`, { signal }),
  ]);
  if (signal?.aborted) return;
  if (latest.status === 'fulfilled' && isRealtimePosition(latest.value.data)) {
    store.upsertPositions([latest.value.data]);
  }
  if (safety.status === 'fulfilled') {
    store.upsertSafetyStates(locateSafety(store, [safety.value.data]));
  }
}
