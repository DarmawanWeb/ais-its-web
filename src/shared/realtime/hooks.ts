import type { BBox } from '@darmawanweb/ais-its-contracts/domain';
import type { CiiUpdatedV1 } from '@darmawanweb/ais-its-contracts/events';
import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';
import { useCallback, useEffect, useEffectEvent, useMemo, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { throttle } from '@/shared/lib/utils';

import { type AlertEventKind, realtime } from './client';
import { type RealtimeConnectionState, useRealtimeConnectionStore } from './connection-store';
import { seedVessel, seedViewport } from './seed';
import { inBBox, type VesselLiveRecord } from './vessel-store';

const EMPTY: readonly VesselLiveRecord[] = [];

/** Connection state of the realtime socket. */
export function useRealtimeConnection(): RealtimeConnectionState & { connected: boolean } {
  const state = useRealtimeConnectionStore(useShallow((s) => s));
  return { ...state, connected: state.status === 'connected' };
}

/** Same bbox values → same array reference (effects keyed on the bbox do not re-run). */
function useStableBBox(bbox: BBox | null | undefined): BBox | null {
  const key = bbox ? bbox.map((value) => value.toFixed(5)).join(',') : '';
  return useMemo(() => (key ? (key.split(',').map(Number) as unknown as BBox) : null), [key]);
}

/**
 * Throttled snapshot of the live vessel store for rendering (deck.gl layers, lists).
 * Re-renders at most once per `throttleMs`; optionally filtered to a bbox.
 */
export function useVesselSnapshot(
  options: { bbox?: BBox | null; throttleMs?: number; marginDeg?: number } = {},
): readonly VesselLiveRecord[] {
  const { throttleMs = 500, marginDeg = 0.05 } = options;
  const bbox = useStableBBox(options.bbox);
  const store = realtime.vessels;
  const subscribe = useCallback(
    (callback: () => void) => {
      const throttled = throttle(callback, throttleMs);
      const unsubscribe = store.subscribe(throttled);
      return () => {
        throttled.cancel();
        unsubscribe();
      };
    },
    [store, throttleMs],
  );
  const all = useSyncExternalStore(
    subscribe,
    () => store.snapshot(),
    () => EMPTY,
  );
  return useMemo(
    () => (bbox ? all.filter((record) => inBBox(record, bbox, marginDeg)) : all),
    [all, bbox, marginDeg],
  );
}

/**
 * Live vessels of a map viewport: joins the zoom-6 tile rooms of the bbox (spec §9), seeds
 * the store from REST and returns a throttled list of records inside the bbox.
 */
export function useViewportPositions(
  bbox: BBox | null | undefined,
  zoom: number,
  options: { throttleMs?: number; seed?: boolean } = {},
): { vessels: readonly VesselLiveRecord[]; status: RealtimeConnectionState['status'] } {
  const { throttleMs = 500, seed = true } = options;
  const stableBbox = useStableBBox(bbox);
  const roundedZoom = Math.round(zoom * 2) / 2;

  useEffect(() => {
    if (!stableBbox) return;
    realtime.setViewport(stableBbox, roundedZoom);
    const controller = new AbortController();
    if (seed) void seedViewport(realtime.vessels, stableBbox, controller.signal);
    return () => controller.abort();
  }, [stableBbox, roundedZoom, seed]);

  useEffect(() => () => realtime.releaseViewport(), []);

  const vessels = useVesselSnapshot({ bbox: stableBbox, throttleMs });
  const status = useRealtimeConnectionStore((s) => s.status);
  return { vessels, status };
}

/** Live position and safety state of one vessel (joins `vessel:<mmsi>` while mounted). */
export function useVesselLive(mmsi: number | null | undefined): VesselLiveRecord | undefined {
  useEffect(() => {
    if (mmsi === null || mmsi === undefined) return;
    const release = realtime.subscribeVessel(mmsi);
    const controller = new AbortController();
    void seedVessel(realtime.vessels, mmsi, controller.signal);
    return () => {
      controller.abort();
      release();
    };
  }, [mmsi]);

  const subscribe = useCallback(
    (callback: () => void) =>
      mmsi === null || mmsi === undefined
        ? () => undefined
        : realtime.vessels.subscribeVessel(mmsi, callback),
    [mmsi],
  );
  return useSyncExternalStore(
    subscribe,
    () => (mmsi === null || mmsi === undefined ? undefined : realtime.vessels.get(mmsi)),
    () => undefined,
  );
}

/** Calls `handler` for every `alert:raised` / `alert:updated` pushed to this user. */
export function useAlertStream(
  handler: (alert: RealtimeAlert, kind: AlertEventKind) => void,
): void {
  const onAlert = useEffectEvent(handler);
  useEffect(() => realtime.on('alert', ({ alert, kind }) => onAlert(alert, kind)), []);
}

/** Calls `handler` for every `cii:updated` of the active organization. */
export function useCiiUpdates(handler: (update: CiiUpdatedV1) => void): void {
  const onUpdate = useEffectEvent(handler);
  useEffect(() => realtime.on('cii', (update) => onUpdate(update)), []);
}
