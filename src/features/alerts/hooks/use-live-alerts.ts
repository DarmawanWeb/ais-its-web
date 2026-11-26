import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getAlertsControllerListQueryKey,
  getAlertsControllerSummaryQueryKey,
} from '@/shared/api/generated/notification/alerts/alerts';
import type {
  AlertPageDto,
  AlertsControllerListParams,
} from '@/shared/api/generated/notification/model';
import { useAlertStream } from '@/shared/realtime/hooks';

import {
  alertFromRealtime,
  findCachedAlert,
  patchAlertCaches,
  prependToPage,
} from '../lib/alert-cache';
import { type AlertFilters, matchesFilters } from '../lib/alert-filters';

/**
 * Realtime inbox (spec §9): `alert:raised` alerts of the current filters appear at the top of
 * the first page (highlighted as new); on later pages they are counted so the user can jump
 * back; `alert:updated` patches the row wherever it is cached. The open counts are refreshed.
 */
export function useLiveAlerts({
  filters,
  params,
  firstPage,
}: {
  filters: AlertFilters;
  /** Params of the current list query (including the cursor). */
  params: AlertsControllerListParams;
  firstPage: boolean;
}) {
  const queryClient = useQueryClient();
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [missed, setMissed] = useState(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const markFresh = useCallback((id: string) => {
    setFreshIds((current) => new Set(current).add(id));
    const previous = timers.current.get(id);
    if (previous) clearTimeout(previous);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setFreshIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, 12_000),
    );
  }, []);

  useAlertStream((alert, kind) => {
    void queryClient.invalidateQueries({ queryKey: getAlertsControllerSummaryQueryKey() });
    const previous = findCachedAlert(queryClient, alert.id);
    const dto = alertFromRealtime(alert, previous);
    if (kind === 'updated' || previous) {
      patchAlertCaches(queryClient, dto);
      if (kind === 'updated') return;
    }
    if (!matchesFilters(alert, filters)) return;
    if (!firstPage) {
      setMissed((count) => count + 1);
      return;
    }
    queryClient.setQueryData<AlertPageDto>(getAlertsControllerListQueryKey(params), (page) =>
      prependToPage(page, dto, params.limit ?? 25),
    );
    markFresh(alert.id);
  });

  const clearMissed = useCallback(() => setMissed(0), []);
  return { freshIds, missed, clearMissed };
}
