import { type BBox, clampBBox } from '@darmawanweb/ais-its-contracts/domain';
import type { CiiUpdatedV1 } from '@darmawanweb/ais-its-contracts/events';
import {
  REALTIME_PATH,
  RealtimeAlertSchema,
  type RealtimeAlert,
  type RealtimeClientToServerEvents,
  type RealtimeServerToClientEvents,
} from '@darmawanweb/ais-its-contracts/realtime';
import { io, type Socket } from 'socket.io-client';

import {
  getAccessToken,
  refreshAccessToken,
  sessionStore,
  type SessionState,
} from '@/shared/auth/session';
import { appConfig } from '@/shared/config/env';

import { setConnectionState, useRealtimeConnectionStore } from './connection-store';
import { batchItems, isCiiUpdate, isRealtimePosition, isRealtimeSafetyState } from './guards';
import { VesselLiveStore } from './vessel-store';

export type AppSocket = Socket<RealtimeServerToClientEvents, RealtimeClientToServerEvents>;

export type AlertEventKind = 'raised' | 'updated';

interface ClientEvents {
  alert: { alert: RealtimeAlert; kind: AlertEventKind };
  cii: CiiUpdatedV1;
}

type Listener<T> = (payload: T) => void;

const ACK_TIMEOUT_MS = 5_000;
const PRUNE_INTERVAL_MS = 60_000;
const VIEWPORT_RELEASE_DELAY_MS = 10_000;
/** Consecutive handshake rejections answered with a token refresh before backing off. */
const MAX_AUTH_RETRIES = 3;
/** Backoff of reconnections socket.io does not retry itself (rejected handshakes, server kicks). */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/** What the server derives rooms from at handshake (user:<id>, org:<id>, authority). */
function handshakeIdentity(state: SessionState): string {
  const claims = state.claims;
  return `${claims?.sub ?? ''}|${claims?.org ?? ''}|${[...(claims?.roles ?? [])].sort().join(',')}`;
}

/**
 * socket.io client manager of the notification service (spec §9): one connection per tab,
 * opened while signed in, handshake `auth: { token }` read on every (re)connection so a
 * reconnect always uses a fresh token; on `connect_error` UNAUTHORIZED the token is refreshed
 * and the socket reconnects. socket.io does not retry rejected handshakes or server-side
 * disconnects, so the client does (backoff), and it reconnects whenever the session adopts a
 * new token while the socket is down. A change of user, organization or roles re-handshakes
 * (rooms are joined at handshake). Viewport and vessel subscriptions are replayed after
 * reconnects.
 */
export class RealtimeClient {
  readonly vessels = new VesselLiveStore();
  private socket: AppSocket | null = null;
  private viewport: { bbox: BBox; zoom: number } | null = null;
  private readonly vesselRefs = new Map<number, number>();
  private readonly listeners: { [K in keyof ClientEvents]: Set<Listener<ClientEvents[K]>> } = {
    alert: new Set(),
    cii: new Set(),
  };
  private pruneTimer: ReturnType<typeof setInterval> | undefined;
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeSession: (() => void) | undefined;
  private authRetries = 0;
  private handshakeToken: string | null = null;
  /** Identity (user, org, roles) of the current handshake. */
  private identity: string | null = null;
  /** Last access token seen from the session store. */
  private sessionToken: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryAttempt = 0;

  /** Follows the session: connects when signed in, disconnects on sign-out. Idempotent. */
  start(): () => void {
    if (!this.unsubscribeSession) {
      this.unsubscribeSession = sessionStore.subscribe((state) => this.sync(state));
      this.sync(sessionStore.getState());
      this.pruneTimer = setInterval(() => this.vessels.prune(), PRUNE_INTERVAL_MS);
    }
    return () => this.stop();
  }

  stop(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
    if (this.pruneTimer !== undefined) clearInterval(this.pruneTimer);
    if (this.releaseTimer !== undefined) clearTimeout(this.releaseTimer);
    this.pruneTimer = undefined;
    this.releaseTimer = undefined;
    this.disconnect();
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** The raw socket (advanced use; prefer the hooks). */
  getSocket(): AppSocket | null {
    return this.socket;
  }

  private sync(state: SessionState): void {
    if (state.status === 'authenticated' && state.accessToken) {
      const identity = handshakeIdentity(state);
      const tokenChanged = state.accessToken !== this.sessionToken;
      this.sessionToken = state.accessToken;
      if (!this.socket) {
        this.identity = identity;
        this.connect();
        return;
      }
      if (identity !== this.identity) {
        // Rooms (user:<id>, org:<id>, authority) are joined at handshake: re-handshake with
        // the new token (another user, organization or role set).
        this.identity = identity;
        this.resetRetries();
        this.vessels.clear();
        this.socket.disconnect().connect();
        return;
      }
      if (tokenChanged) {
        this.resetRetries();
        // socket.io never retries a rejected handshake: a new token is the moment to try again.
        if (!this.socket.connected && !this.socket.active) this.socket.connect();
      }
    } else if (state.status === 'unauthenticated') {
      this.sessionToken = null;
      if (this.socket) {
        this.disconnect();
        this.vessels.clear();
      }
    }
  }

  private resetRetries(): void {
    this.authRetries = 0;
    this.retryAttempt = 0;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  /** Reconnects later (backoff) when socket.io will not do it by itself. */
  private scheduleRetry(): void {
    if (this.retryTimer !== undefined || !this.socket) return;
    const delay =
      RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      const socket = this.socket;
      if (!socket || socket.connected || socket.active) return;
      if (sessionStore.getState().status !== 'authenticated') return;
      if (this.authRetries >= MAX_AUTH_RETRIES) this.authRetries = MAX_AUTH_RETRIES - 1;
      setConnectionState({ status: 'reconnecting' });
      socket.connect();
    }, delay);
  }

  private connect(): void {
    const options = {
      path: appConfig.realtimePath || REALTIME_PATH,
      autoConnect: false,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 15_000,
      randomizationFactor: 0.5,
      auth: (callback: (data: object) => void) => {
        this.handshakeToken = getAccessToken();
        callback({ token: this.handshakeToken ?? '' });
      },
    };
    const socket: AppSocket = appConfig.realtimeUrl
      ? io(appConfig.realtimeUrl, options)
      : io(options);
    this.socket = socket;
    setConnectionState({ status: 'connecting', error: null });

    socket.on('connect', () => {
      this.resetRetries();
      setConnectionState({
        status: 'connected',
        error: null,
        connectedAt: Date.now(),
        attempts: 0,
      });
      this.replaySubscriptions();
    });
    socket.on('disconnect', (reason) => {
      // "io server disconnect": the server closed the connection and socket.io will not
      // reconnect by itself.
      const retry = !socket.active && reason === 'io server disconnect';
      setConnectionState({
        status: socket.active || retry ? 'reconnecting' : 'disconnected',
        error: reason,
      });
      if (retry) this.scheduleRetry();
    });
    socket.on('connect_error', (error) => {
      const data = (error as Error & { data?: { code?: string } }).data;
      const code = data?.code ?? error.message;
      if (code === 'UNAUTHORIZED') {
        void this.handleUnauthorized();
        return;
      }
      setConnectionState({
        status: socket.active ? 'reconnecting' : 'error',
        error: code,
        attempts: useRealtimeConnectionStore.getState().attempts + 1,
      });
      // Rejected by the server's middleware (another reason than the token): retry later.
      if (!socket.active) this.scheduleRetry();
    });

    socket.on('positions', (batch) => {
      this.vessels.upsertPositions(batchItems(batch, isRealtimePosition));
    });
    socket.on('safety:states', (batch) => {
      this.vessels.upsertSafetyStates(batchItems(batch, isRealtimeSafetyState));
    });
    socket.on('vessel:position', (position) => {
      if (isRealtimePosition(position)) this.vessels.upsertPositions([position]);
    });
    socket.on('vessel:safety', (state) => {
      if (isRealtimeSafetyState(state)) this.vessels.upsertSafetyStates([state]);
    });
    socket.on('alert:raised', (alert) => this.emitAlert(alert, 'raised'));
    socket.on('alert:updated', (alert) => this.emitAlert(alert, 'updated'));
    socket.on('cii:updated', (update) => {
      if (isCiiUpdate(update)) this.emit('cii', update);
    });

    socket.connect();
  }

  private disconnect(): void {
    this.resetRetries();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.identity = null;
    setConnectionState({ status: 'idle', error: null, connectedAt: null, attempts: 0 });
  }

  private async handleUnauthorized(): Promise<void> {
    if (this.authRetries >= MAX_AUTH_RETRIES) {
      // Fresh tokens keep being rejected: back off (a new session token also reconnects).
      setConnectionState({ status: 'error', error: 'UNAUTHORIZED' });
      this.scheduleRetry();
      return;
    }
    this.authRetries += 1;
    setConnectionState({ status: 'reconnecting', error: 'UNAUTHORIZED' });
    const rejected = this.handshakeToken;
    const current = getAccessToken();
    // The session already holds a newer token (refreshed meanwhile): use it right away.
    const token = current && current !== rejected ? current : await refreshAccessToken(rejected);
    const socket = this.socket;
    if (!socket || sessionStore.getState().status !== 'authenticated') return;
    if (token) {
      // Middleware rejections are not retried by socket.io: reconnect with the fresh token.
      if (!socket.connected && !socket.active) socket.connect();
      return;
    }
    // The refresh failed transiently (the session layer keeps the session and retries):
    // retry the socket with backoff instead of staying down until a reload.
    this.scheduleRetry();
  }

  private emitAlert(alert: unknown, kind: AlertEventKind): void {
    const parsed = RealtimeAlertSchema.safeParse(alert);
    if (parsed.success) this.emit('alert', { alert: parsed.data, kind });
    else if (import.meta.env.DEV) console.warn('[realtime] invalid alert', parsed.error.issues);
  }

  private emit<K extends keyof ClientEvents>(event: K, payload: ClientEvents[K]): void {
    for (const listener of this.listeners[event]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[realtime] ${event} listener failed`, error);
      }
    }
  }

  /** Subscribes to alert / CII events; returns the unsubscribe function. */
  on<K extends keyof ClientEvents>(event: K, listener: Listener<ClientEvents[K]>): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  private replaySubscriptions(): void {
    if (this.viewport) this.emitViewport(this.viewport);
    for (const mmsi of this.vesselRefs.keys()) {
      this.socket?.timeout(ACK_TIMEOUT_MS).emit('vessel:subscribe', { mmsi }, () => undefined);
    }
  }

  private emitViewport(viewport: { bbox: BBox; zoom: number }): void {
    const request = {
      bbox: [...viewport.bbox] as [number, number, number, number],
      zoom: viewport.zoom,
    };
    this.socket?.timeout(ACK_TIMEOUT_MS).emit('viewport:set', request, (error, ack) => {
      if (error) setConnectionState({ error: 'VIEWPORT_TIMEOUT' });
      else if (!ack.ok) setConnectionState({ error: ack.error.code });
    });
  }

  /** Joins the tile rooms of a map viewport (replaces the previous viewport). */
  setViewport(bbox: BBox, zoom: number): void {
    if (this.releaseTimer !== undefined) clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    const viewport = { bbox: clampBBox(bbox), zoom: Math.max(0, Math.min(22, zoom)) };
    this.viewport = viewport;
    if (this.socket?.connected) this.emitViewport(viewport);
  }

  /**
   * Called when the last live map unmounts: after a grace period the socket reconnects
   * without tile rooms so positions stop streaming to pages without a map.
   */
  releaseViewport(): void {
    if (this.releaseTimer !== undefined) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      if (!this.viewport) return;
      this.viewport = null;
      if (this.socket?.connected) this.socket.disconnect().connect();
    }, VIEWPORT_RELEASE_DELAY_MS);
  }

  /** Joins `vessel:<mmsi>` (reference counted); returns the release function. */
  subscribeVessel(mmsi: number): () => void {
    const count = this.vesselRefs.get(mmsi) ?? 0;
    this.vesselRefs.set(mmsi, count + 1);
    if (count === 0 && this.socket?.connected) {
      this.socket.timeout(ACK_TIMEOUT_MS).emit('vessel:subscribe', { mmsi }, () => undefined);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.vesselRefs.get(mmsi) ?? 1) - 1;
      if (remaining > 0) {
        this.vesselRefs.set(mmsi, remaining);
        return;
      }
      this.vesselRefs.delete(mmsi);
      if (this.socket?.connected) {
        this.socket.timeout(ACK_TIMEOUT_MS).emit('vessel:unsubscribe', { mmsi }, () => undefined);
      }
    };
  }
}

/** The app-wide realtime client (started by the app providers). */
export const realtime = new RealtimeClient();
