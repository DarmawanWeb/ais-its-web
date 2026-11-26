import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import type { ReadingsControllerSeries200 } from '@/shared/api/generated/telemetry/model';
import {
  getReadingsControllerSeriesQueryKey,
  getReadingsControllerStatusQueryKey,
  getReadingsControllerSummaryQueryKey,
  getReadingsControllerVesselsQueryKey,
  readingsControllerSeries,
  useReadingsControllerVessels,
} from '@/shared/api/generated/telemetry/readings/readings';

import type { Bucket, TimeRange } from '../lib/range';

/** Vessels of the organization with their telemetry state (`GET /telemetry/vessels`). */
export function useTelemetryVessels() {
  return useReadingsControllerVessels(
    { pageSize: 100 },
    { query: { refetchInterval: 60_000, placeholderData: keepPreviousData } },
  );
}

const PAGE_LIMIT = 500;
/** At most 4 pages (2 000 points) are loaded for the chart, the table and the CSV export. */
export const SERIES_MAX_PAGES = 4;

/**
 * Readings of a vessel in a range (`GET /telemetry/vessels/:mmsi/readings`, ascending cursor
 * pages of 500), loading the following pages up to {@link SERIES_MAX_PAGES}.
 */
export function useSeries(mmsi: number | null, range: TimeRange, bucket: Bucket) {
  const params = { from: range.from, to: range.to, bucket };
  const query = useInfiniteQuery({
    queryKey: [...getReadingsControllerSeriesQueryKey(String(mmsi ?? 0), params), 'pages'],
    queryFn: ({ pageParam, signal }) =>
      readingsControllerSeries(
        String(mmsi ?? 0),
        { ...params, limit: PAGE_LIMIT, ...(pageParam ? { cursor: pageParam } : {}) },
        undefined,
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page: ReadingsControllerSeries200) => page.page.nextCursor,
    enabled: mmsi !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const loaded = query.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError && loaded < SERIES_MAX_PAGES) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, loaded, fetchNextPage]);
  const pages = query.data?.pages;
  const points = useMemo(() => pages?.flatMap((page) => page.data) ?? [], [pages]);
  return {
    query,
    points,
    truncated: loaded >= SERIES_MAX_PAGES && Boolean(hasNextPage),
    loadingMore: Boolean(hasNextPage) && loaded < SERIES_MAX_PAGES,
  };
}

/** Re-reads everything a new reading changes (series, summary, status, the vessels list). */
export function useInvalidateTelemetry() {
  const queryClient = useQueryClient();
  return useCallback(
    (mmsi: number) => {
      void queryClient.invalidateQueries({
        queryKey: getReadingsControllerSeriesQueryKey(String(mmsi)),
      });
      void queryClient.invalidateQueries({
        queryKey: getReadingsControllerSummaryQueryKey(String(mmsi)),
      });
      void queryClient.invalidateQueries({
        queryKey: getReadingsControllerStatusQueryKey(String(mmsi)),
      });
      void queryClient.invalidateQueries({ queryKey: getReadingsControllerVesselsQueryKey() });
    },
    [queryClient],
  );
}
