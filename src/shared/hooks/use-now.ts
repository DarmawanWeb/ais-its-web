import { useEffect, useState } from 'react';

import { nowMs } from '@/shared/lib/clock';

/**
 * A "now" rounded down to `intervalMs` that advances once per interval: time-window queries
 * (`from = now - 24 h`) keep a stable query key between ticks and refresh on each tick. The
 * check runs four times per interval, so the value moves close to the boundary.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Math.floor(nowMs() / intervalMs) * intervalMs);
  useEffect(() => {
    const tick = () => setNow(Math.floor(nowMs() / intervalMs) * intervalMs);
    tick();
    const timer = setInterval(tick, Math.max(1_000, intervalMs / 4));
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
