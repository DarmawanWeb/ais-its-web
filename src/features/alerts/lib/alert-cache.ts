import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';
import type { QueryClient } from '@tanstack/react-query';

import {
  getAlertsControllerGetQueryKey,
  getAlertsControllerListQueryKey,
} from '@/shared/api/generated/notification/alerts/alerts';
import type { AlertDto, AlertPageDto } from '@/shared/api/generated/notification/model';

/**
 * Pure helpers that keep the TanStack Query caches of the alert inbox in step with
 * acknowledgements (optimistic updates) and the realtime stream (spec §9: `alert:raised` /
 * `alert:updated` carry a `RealtimeAlert`, a subset of `AlertDto`).
 */

/** `AlertDto` of a realtime alert; fields the push does not carry come from `previous`. */
export function alertFromRealtime(alert: RealtimeAlert, previous?: AlertDto | null): AlertDto {
  const now = new Date().toISOString();
  return {
    orgId: previous?.orgId ?? null,
    dedupKey: previous?.dedupKey ?? '',
    source: previous?.source ?? alert.domain,
    acknowledgedBy: previous?.acknowledgedBy ?? null,
    acknowledgedAt:
      previous?.acknowledgedAt ?? (alert.status === 'acknowledged' ? alert.lastOccurredAt : null),
    resolvedBy: previous?.resolvedBy ?? null,
    resolvedAt: previous?.resolvedAt ?? (alert.status === 'resolved' ? now : null),
    updatedAt: now,
    messageKey: previous?.messageKey ?? null,
    messageParams: previous?.messageParams ?? {},
    resolutionReason: previous?.resolutionReason ?? null,
    resolutionMessageKey: previous?.resolutionMessageKey ?? null,
    resolutionMessageParams: previous?.resolutionMessageParams ?? {},
    resolutionEventId: previous?.resolutionEventId ?? null,
    id: alert.id,
    type: alert.type,
    domain: alert.domain,
    severity: alert.severity,
    status: alert.status,
    mmsi: alert.mmsi,
    relatedMmsi: alert.relatedMmsi,
    title: alert.title,
    message: alert.message,
    lat: alert.lat,
    lon: alert.lon,
    zoneId: alert.zoneId,
    methodId: alert.methodId,
    data: alert.data,
    occurrences: alert.occurrences,
    occurredAt: alert.occurredAt,
    lastOccurredAt: alert.lastOccurredAt,
  };
}

/** The cached alert of that id (detail, then any list page), if any. */
export function findCachedAlert(queryClient: QueryClient, id: string): AlertDto | undefined {
  const detail = queryClient.getQueryData<AlertDto>(getAlertsControllerGetQueryKey(id));
  if (detail) return detail;
  for (const [, page] of queryClient.getQueriesData<AlertPageDto>({
    queryKey: getAlertsControllerListQueryKey(),
  })) {
    const found = page?.data?.find((alert) => alert.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Merges `patch` into the alert of that id in every list page and in its detail. */
export function patchAlertCaches(
  queryClient: QueryClient,
  patch: Partial<AlertDto> & { id: string },
): void {
  queryClient.setQueriesData<AlertPageDto>(
    { queryKey: getAlertsControllerListQueryKey() },
    (page) =>
      page?.data?.some((alert) => alert.id === patch.id)
        ? {
            ...page,
            data: page.data.map((alert) =>
              alert.id === patch.id ? { ...alert, ...patch } : alert,
            ),
          }
        : page,
  );
  queryClient.setQueryData<AlertDto>(getAlertsControllerGetQueryKey(patch.id), (current) =>
    current ? { ...current, ...patch } : current,
  );
}

/** Puts `alert` first in a cached page (replacing an older copy), keeping the page size. */
export function prependToPage(page: AlertPageDto | undefined, alert: AlertDto, limit: number) {
  if (!page) return page;
  const rest = page.data.filter((item) => item.id !== alert.id);
  return { ...page, data: [alert, ...rest].slice(0, limit) };
}

/** Snapshot of every alert cache, for the rollback of an optimistic update. */
export interface AlertCacheSnapshot {
  lists: [readonly unknown[], AlertPageDto | undefined][];
  detail: [readonly unknown[], AlertDto | undefined];
}

export function snapshotAlertCaches(queryClient: QueryClient, id: string): AlertCacheSnapshot {
  const detailKey = getAlertsControllerGetQueryKey(id);
  return {
    lists: queryClient.getQueriesData<AlertPageDto>({
      queryKey: getAlertsControllerListQueryKey(),
    }),
    detail: [detailKey, queryClient.getQueryData<AlertDto>(detailKey)],
  };
}

export function restoreAlertCaches(queryClient: QueryClient, snapshot: AlertCacheSnapshot): void {
  for (const [key, data] of snapshot.lists) queryClient.setQueryData(key, data);
  const [detailKey, detail] = snapshot.detail;
  if (detail) queryClient.setQueryData(detailKey, detail);
}
