import { create } from 'zustand';

export type RealtimeStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface RealtimeConnectionState {
  status: RealtimeStatus;
  /** Last connection error code/message (UNAUTHORIZED, transport error…). */
  error: string | null;
  connectedAt: number | null;
  /** Reconnection attempts since the last successful connection. */
  attempts: number;
}

/** Connection state of the realtime socket (read with useRealtimeConnection()). */
export const useRealtimeConnectionStore = create<RealtimeConnectionState>(() => ({
  status: 'idle',
  error: null,
  connectedAt: null,
  attempts: 0,
}));

export function setConnectionState(patch: Partial<RealtimeConnectionState>): void {
  useRealtimeConnectionStore.setState(patch);
}
