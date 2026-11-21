import axios from 'axios';
import { useState } from 'react';
import type { MarkerData } from '../components/common/map';
import { isRequestCanceled } from '../lib/api';
import { VITE_BACKEND_URI } from '../lib/env';
import { usePolling } from './use-polling';

interface FleetPositionsOptions {
  /** Refresh interval (use FLEET_POLL_INTERVAL_MS), or null to load once. */
  intervalMs: number | null;
  params?: Record<string, string | number>;
  normalize?: (ships: MarkerData[]) => MarkerData[];
}

/**
 * Ships with their recent positions (GET /ais). Every response replaces the
 * previous list; it is never appended to, so the list cannot grow.
 */
export function useFleetPositions({
  intervalMs,
  params,
  normalize,
}: FleetPositionsOptions) {
  const [ships, setShips] = useState<MarkerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  usePolling(async (signal) => {
    try {
      const response = await axios.get(`${VITE_BACKEND_URI}/ais`, {
        params,
        signal,
      });
      if (signal.aborted) return;
      const data = (response.data?.data ?? []) as MarkerData[];
      setShips(normalize ? normalize(data) : data);
    } catch (error) {
      if (!isRequestCanceled(error)) {
        console.error('Error fetching ship data:', error);
      }
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, intervalMs);

  return { ships, isLoading };
}
