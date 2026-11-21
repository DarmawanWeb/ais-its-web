import { useEffect, useState } from 'react';

/**
 * Seconds left until `until` (ms since epoch), ticking every second; 0 when elapsed or null.
 * Used for Retry-After throttling messages.
 */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (until === null) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}
