import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { throttle } from '@/shared/lib/utils';
import { useAlertStream } from '@/shared/realtime/hooks';

const SURVEILLANCE_PREFIX = '/api/v2/surveillance';

/** Invalidates every cached surveillance query (generated keys start with the request URL). */
export function invalidateSurveillance(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      return typeof head === 'string' && head.startsWith(SURVEILLANCE_PREFIX);
    },
  });
}

/**
 * Keeps the surveillance pages live (spec §9): every `alert:raised` / `alert:updated` of the
 * surveillance domain refetches the active surveillance queries, at most every 5 s.
 */
export function useSurveillanceLive(): void {
  const queryClient = useQueryClient();
  const refresh = useMemo(
    () => throttle(() => void invalidateSurveillance(queryClient), 5_000),
    [queryClient],
  );
  useEffect(() => () => refresh.cancel(), [refresh]);
  useAlertStream((alert) => {
    if (alert.domain === 'surveillance') refresh();
  });
}
