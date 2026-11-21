import { useEffect, useRef } from 'react';

/** Fleet lists (GET /ais) are refreshed at most every 10 s. */
export const FLEET_POLL_INTERVAL_MS = 10_000;
/** Per-vessel detail panels are refreshed at most every 5 s. */
export const DETAIL_POLL_INTERVAL_MS = 5_000;

export type PollingTask = (signal: AbortSignal) => Promise<void>;

/**
 * Runs `task` now and then again `intervalMs` after the previous run has
 * finished, so at most one request is in flight. When `key` changes or the
 * component unmounts, the pending timer is cleared and the request in flight
 * is aborted through the signal passed to `task` (pass it to axios).
 *
 * `intervalMs = null` runs the task once per key; `key = null` pauses.
 * The latest `task` is always used, so it may close over fresh state.
 */
export function usePolling(
  task: PollingTask,
  intervalMs: number | null,
  key: string | number | boolean | null = true,
): void {
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (key === null) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      try {
        await taskRef.current(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Polling task failed:', error);
        }
      }
      if (!controller.signal.aborted && intervalMs !== null) {
        timer = setTimeout(run, intervalMs);
      }
    };
    void run();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [key, intervalMs]);
}
