import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { positionsControllerVesselLatest } from '@/shared/api/generated/ais-processor/ais/ais';
import type { VesselLatestDto } from '@/shared/api/generated/ais-processor/model';
import {
  getCiiControllerFleetSummaryQueryOptions,
  useCiiControllerFleetSummary,
} from '@/shared/api/generated/emission/cii/cii';
import type { FleetSummaryDto, FleetVesselCiiDto } from '@/shared/api/generated/emission/model';
import type {
  VesselDetailDto,
  VesselsControllerListParams,
} from '@/shared/api/generated/fleet/model';
import {
  getVesselsControllerGetByMmsiQueryKey,
  getVesselsControllerGetQueryKey,
  getVesselsControllerListQueryKey,
  useVesselsControllerGetByMmsi,
  useVesselsControllerList,
} from '@/shared/api/generated/fleet/vessels/vessels';
import { isApiProblem } from '@/shared/api/problem';
import { serviceKeys } from '@/shared/api/query-keys';

import { currentYear } from '@/shared/lib/clock';

/** One page of the fleet list (`GET /vessels`, page-based); keeps the previous page while loading. */
export function useVesselList(params: VesselsControllerListParams, enabled = true) {
  return useVesselsControllerList(params, {
    query: { placeholderData: keepPreviousData, staleTime: 30_000, enabled },
  });
}

/** Number of vessels matching a filter (`pageSize=1`, `meta.total`). */
export function useVesselCount(params: VesselsControllerListParams, enabled = true) {
  return useVesselsControllerList(
    { ...params, page: 1, pageSize: 1 },
    { query: { staleTime: 60_000, enabled, select: (page) => page.meta.total } },
  );
}

/** A vessel by MMSI (`GET /vessels/by-mmsi/:mmsi`): detail view for the own organization. */
export function useVesselByMmsi(mmsi: number | null) {
  return useVesselsControllerGetByMmsi(String(mmsi ?? ''), {
    query: { enabled: mmsi !== null, staleTime: 30_000 },
  });
}

/** Keeps the fleet caches in step after a write (detail by MMSI and id, lists, palette search). */
export function useVesselCache() {
  const queryClient = useQueryClient();
  const put = useCallback(
    (vessel: VesselDetailDto, previousMmsi?: number) => {
      queryClient.setQueryData(getVesselsControllerGetByMmsiQueryKey(String(vessel.mmsi)), vessel);
      queryClient.setQueryData(getVesselsControllerGetQueryKey(vessel.id), vessel);
      if (previousMmsi !== undefined && previousMmsi !== vessel.mmsi) {
        queryClient.removeQueries({
          queryKey: getVesselsControllerGetByMmsiQueryKey(String(previousMmsi)),
        });
      }
      void queryClient.invalidateQueries({ queryKey: getVesselsControllerListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['fleet', 'vessels'] });
    },
    [queryClient],
  );
  const remove = useCallback(
    (vessel: Pick<VesselDetailDto, 'id' | 'mmsi'>) => {
      queryClient.removeQueries({
        queryKey: getVesselsControllerGetByMmsiQueryKey(String(vessel.mmsi)),
      });
      queryClient.removeQueries({ queryKey: getVesselsControllerGetQueryKey(vessel.id) });
      void queryClient.invalidateQueries({ queryKey: getVesselsControllerListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ['fleet', 'vessels'] });
    },
    [queryClient],
  );
  return { put, remove };
}

const aisKeys = serviceKeys('ais-processor').resource('vessel-latest');

/**
 * Latest AIS position of each MMSI ("last seen"; `GET /ais/vessels/:mmsi/latest`, 404 = never
 * seen). One request per vessel of the page: the processor has no batch lookup.
 */
export function useLastSeen(mmsis: readonly number[], enabled = true) {
  const combine = useCallback(
    (results: { data?: VesselLatestDto | null; isPending: boolean }[]) => {
      const byMmsi = new Map<number, VesselLatestDto | null>();
      results.forEach((result, index) => {
        const mmsi = mmsis[index];
        if (mmsi !== undefined && result.data !== undefined) byMmsi.set(mmsi, result.data);
      });
      return { byMmsi, pending: enabled && results.some((result) => result.isPending) };
    },
    [mmsis, enabled],
  );
  return useQueries({
    queries: mmsis.map((mmsi) => ({
      queryKey: aisKeys.detail(mmsi),
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<VesselLatestDto | null> => {
        try {
          return await positionsControllerVesselLatest(String(mmsi), undefined, signal);
        } catch (error) {
          if (isApiProblem(error) && error.status === 404) return null;
          throw error;
        }
      },
      staleTime: 60_000,
      refetchInterval: 120_000,
      enabled,
    })),
    combine,
  });
}

const FLEET_PAGE_SIZE = 100;

function combineFleetPages(results: { data?: FleetSummaryDto }[]): Map<number, FleetVesselCiiDto> {
  const map = new Map<number, FleetVesselCiiDto>();
  for (const result of results)
    for (const item of result.data?.items ?? []) map.set(item.mmsi, item);
  return map;
}
const FLEET_MAX_PAGES = 10;

/**
 * CII of the organization's vessels for the current year (`GET /cii/fleet/summary`, ordered
 * by MMSI, 100 per page, at most 10 pages): grade per MMSI for the fleet list.
 */
export function useFleetCiiGrades(enabled: boolean) {
  const year = currentYear();
  const first = useCiiControllerFleetSummary(
    { year, page: 1, pageSize: FLEET_PAGE_SIZE },
    { query: { enabled, staleTime: 5 * 60_000, retry: false } },
  );
  const pageCount = first.data
    ? Math.min(Math.ceil(first.data.meta.total / FLEET_PAGE_SIZE), FLEET_MAX_PAGES)
    : 1;
  const restByMmsi = useQueries({
    queries: Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) =>
      getCiiControllerFleetSummaryQueryOptions(
        { year, page: index + 2, pageSize: FLEET_PAGE_SIZE },
        { query: { enabled, staleTime: 5 * 60_000, retry: false } },
      ),
    ),
    combine: combineFleetPages,
  });
  const byMmsi = useMemo(() => {
    const map = new Map(restByMmsi);
    for (const item of first.data?.items ?? []) map.set(item.mmsi, item);
    return map;
  }, [first.data, restByMmsi]);
  return { byMmsi, summary: first.data, isPending: enabled && first.isPending, error: first.error };
}
