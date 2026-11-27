import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';

import { usePositionsControllerPairTrack } from '@/shared/api/generated/ais-processor/ais/ais';
import type { PositionsControllerPairTrackParams } from '@/shared/api/generated/ais-processor/model';
import { useZonesControllerGeojson } from '@/shared/api/generated/geo/zones/zones';
import type { ZonesControllerGeojsonKindItem } from '@/shared/api/generated/geo/model';
import { useDetectorsControllerList } from '@/shared/api/generated/surveillance/detectors/detectors';
import {
  eventsControllerList,
  getEventsControllerGetQueryKey,
  getEventsControllerListQueryKey,
  useEventsControllerGet,
  useEventsControllerList,
  useEventsControllerReview,
} from '@/shared/api/generated/surveillance/events/events';
import {
  fishingViolationsControllerList,
  useFishingViolationsControllerList,
} from '@/shared/api/generated/surveillance/fishing-violations/fishing-violations';
import type {
  EventsControllerListParams,
  FishingViolationsControllerListParams,
  StatisticsControllerHeatmapParams,
  TranshipmentsControllerListParams,
} from '@/shared/api/generated/surveillance/model';
import {
  getStatisticsControllerStatsQueryKey,
  useStatisticsControllerHeatmap,
  useStatisticsControllerSeries,
  useStatisticsControllerStats,
} from '@/shared/api/generated/surveillance/statistics/statistics';
import {
  getTranshipmentsControllerListQueryKey,
  transhipmentsControllerList,
  useTranshipmentsControllerList,
} from '@/shared/api/generated/surveillance/transhipments/transhipments';

import type { SurveillanceEvent } from '../lib/dto';
import { collectCursorPages, collectPages } from '../lib/export';

/** Lists refresh in the background; realtime alerts invalidate them (useSurveillanceLive). */
const LIST_STALE_MS = 15_000;

/** `GET /surveillance/events` (cursor list, newest first; tenancy applied by the service). */
export function useSurveillanceEvents(params: EventsControllerListParams, enabled = true) {
  return useEventsControllerList(params, {
    query: {
      placeholderData: keepPreviousData,
      staleTime: LIST_STALE_MS,
      enabled,
    },
  });
}

/** `GET /surveillance/events/:id` (`404 SURVEILLANCE_EVENT_NOT_FOUND` when not visible). */
export function useSurveillanceEvent(id: string | null | undefined) {
  return useEventsControllerGet(id ?? '', {
    query: { enabled: !!id, staleTime: LIST_STALE_MS },
  });
}

/**
 * `PATCH /surveillance/events/:id` [surveillance:review]. The answer replaces the cached event;
 * lists, transhipment results and statistics are refetched.
 */
export function useReviewEvent() {
  const queryClient = useQueryClient();
  return useEventsControllerReview({
    mutation: {
      onSuccess: (event: SurveillanceEvent) => {
        // The answer is the full event (same shape as GET /surveillance/events/:id).
        queryClient.setQueryData(getEventsControllerGetQueryKey(event.id), event);
        void queryClient.invalidateQueries({ queryKey: getEventsControllerListQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getTranshipmentsControllerListQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getStatisticsControllerStatsQueryKey() });
      },
    },
  });
}

/** `GET /surveillance/transhipments` (legacy result shape, cursor list). */
export function useTranshipmentResults(params: TranshipmentsControllerListParams, enabled = true) {
  return useTranshipmentsControllerList(params, {
    query: {
      placeholderData: keepPreviousData,
      staleTime: LIST_STALE_MS,
      enabled,
    },
  });
}

/** `GET /surveillance/heatmap` grid counts. */
export function useSurveillanceHeatmap(params: StatisticsControllerHeatmapParams, enabled = true) {
  return useStatisticsControllerHeatmap(params, {
    query: { placeholderData: keepPreviousData, staleTime: 60_000, enabled },
  });
}

/** `GET /surveillance/fishing-violations` (historical apprehensions, page-based). */
export function useFishingViolations(params: FishingViolationsControllerListParams) {
  return useFishingViolationsControllerList(params, {
    query: { placeholderData: keepPreviousData, staleTime: 5 * 60_000 },
  });
}

/** Every historical violation of a year (map layer): pages of 100 collected, at most 2 000. */
export function useAllFishingViolations(year: number | undefined) {
  const [query] = useQueries({
    queries: [
      {
        queryKey: ['surveillance', 'fishing-violations', 'all', { year }],
        queryFn: () =>
          collectPages(
            (page) =>
              fishingViolationsControllerList({ page, pageSize: 100, ...(year ? { year } : {}) }),
            2_000,
          ),
        staleTime: 5 * 60_000,
      },
    ],
  });
  return query;
}

/** `GET /surveillance/stats` of a range. */
export function useSurveillanceStats(params: { from?: string; to?: string }) {
  return useStatisticsControllerStats(params, { query: { staleTime: 30_000 } });
}

/**
 * Counts per hour or local day for the overview time series (`GET /surveillance/stats/series`,
 * one request; empty buckets included). Ranges up to 48 hours use hours.
 */
export function useStatsSeries(from: string, to: string) {
  const span = Date.parse(to) - Date.parse(from);
  return useStatisticsControllerSeries(
    { from, to, bucket: span <= 48 * 3_600_000 ? 'hour' : 'day', tz: browserTimeZone() },
    { query: { staleTime: 60_000 } },
  );
}

/** The browser's IANA time zone for local buckets (`UTC` when unknown). */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** `GET /surveillance/detectors`: enabled detectors, method ids and active thresholds. */
export function useDetectors() {
  return useDetectorsControllerList({ query: { staleTime: 10 * 60_000 } });
}

/** `GET /ais/pairs/track` (ais-processor): both vessels' raw tracks for the replay. */
export function usePairTrack(params: PositionsControllerPairTrackParams | null) {
  return usePositionsControllerPairTrack(params ?? { mmsi1: 0, mmsi2: 0 }, {
    query: { enabled: !!params, staleTime: 5 * 60_000 },
  });
}

/**
 * Zones of some kinds for map context (`GET /zones/geojson`, geo service): transhipment areas,
 * fishing grounds, harbours. Arrays are sent as repeated parameters (`kind=a&kind=b`).
 */
export function useZoneOverlay(kinds: readonly ZonesControllerGeojsonKindItem[], enabled = true) {
  return useZonesControllerGeojson(
    { kind: [...kinds], active: true },
    {
      query: { staleTime: 5 * 60_000, enabled },
      request: { paramsSerializer: { indexes: null } },
    },
  );
}

/** Every event of a query (CSV export): cursor pages of 500, at most 5 000 rows. */
export function exportEvents(params: EventsControllerListParams) {
  return collectCursorPages<SurveillanceEvent>((cursor) =>
    eventsControllerList({ ...params, limit: 500, ...(cursor ? { cursor } : {}) }),
  );
}

/** Every transhipment result of a query (CSV export). */
export function exportTranshipmentResults(params: TranshipmentsControllerListParams) {
  return collectCursorPages((cursor) =>
    transhipmentsControllerList({ ...params, limit: 500, ...(cursor ? { cursor } : {}) }),
  );
}

/** Every historical violation (CSV export). */
export function exportFishingViolations(params: FishingViolationsControllerListParams) {
  return collectPages((page) =>
    fishingViolationsControllerList({ ...params, page, pageSize: 100 }),
  );
}
