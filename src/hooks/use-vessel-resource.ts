import axios from 'axios';
import { useState } from 'react';
import {
  getApiErrorMessage,
  isNotFoundError,
  isRequestCanceled,
} from '../lib/api';
import { usePolling } from './use-polling';

/** JSON body of a backend response: `{ message, data, success, ... }`. */
export type ApiBody = { data?: unknown; [key: string]: unknown };

export interface VesselResource<T> {
  data: T | null;
  /** Set when the backend answered 404, e.g. "CII not available ...". */
  notFoundMessage: string | null;
}

/**
 * Data of one vessel's detail panel, loaded for `mmsi` and refreshed every
 * `intervalMs` (null: loaded once per vessel). Data always belongs to the
 * current `mmsi`: after a new selection the previous vessel's data is never
 * shown. Other errors keep the last good data.
 */
export function useVesselResource<T>(
  mmsi: string | null,
  buildUrl: (mmsi: string) => string,
  select: (body: ApiBody) => T | null,
  intervalMs: number | null,
): VesselResource<T> {
  const [state, setState] = useState<
    ({ mmsi: string } & VesselResource<T>) | null
  >(null);

  usePolling(
    async (signal) => {
      if (!mmsi) return;
      try {
        const response = await axios.get<ApiBody>(buildUrl(mmsi), { signal });
        if (signal.aborted) return;
        setState({ mmsi, data: select(response.data), notFoundMessage: null });
      } catch (error) {
        if (signal.aborted || isRequestCanceled(error)) return;
        if (isNotFoundError(error)) {
          setState({
            mmsi,
            data: null,
            notFoundMessage: getApiErrorMessage(error) ?? 'Not found',
          });
          return;
        }
        console.error(`Error fetching ${buildUrl(mmsi)}:`, error);
      }
    },
    intervalMs,
    mmsi,
  );

  return state?.mmsi === mmsi
    ? { data: state.data, notFoundMessage: state.notFoundMessage }
    : { data: null, notFoundMessage: null };
}
