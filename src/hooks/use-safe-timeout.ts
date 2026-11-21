import { useCallback, useEffect, useState } from 'react';

/** Like setTimeout, but pending callbacks are cancelled on unmount. */
export function useSafeTimeout(): (callback: () => void, ms: number) => void {
  const [timers] = useState(() => new Set<ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      timers.forEach(clearTimeout);
      timers.clear();
    },
    [timers],
  );

  return useCallback(
    (callback: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, ms);
      timers.add(timer);
    },
    [timers],
  );
}
