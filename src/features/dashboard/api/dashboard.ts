import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  getStatsControllerDescribeQueryKey,
  useStatsControllerDescribe,
} from '@/shared/api/generated/ais-processor/ais/ais';
import type { AisStatsDto } from '@/shared/api/generated/ais-processor/model';
import {
  ciiControllerDaily,
  useCiiControllerFleetSummary,
} from '@/shared/api/generated/emission/cii/cii';
import type { DailyCiiDto, FleetVesselCiiDto } from '@/shared/api/generated/emission/model';
import {
  useAlertsControllerList,
  useAlertsControllerSummary,
} from '@/shared/api/generated/notification/alerts/alerts';
import { useVesselStatesControllerList } from '@/shared/api/generated/safety/vessels/vessels';
import { useStatisticsControllerStats } from '@/shared/api/generated/surveillance/statistics/statistics';
import { isApiProblem } from '@/shared/api/problem';
import { serviceKeys } from '@/shared/api/query-keys';

import { fuelTotals, pushSample, rateSample, type RateSample } from '../lib/dashboard';

const DAY = 86_400_000;

/** Platform AIS statistics (`GET /ais/stats`), refreshed every 15 s. */
export function useAisStats(enabled: boolean) {
  return useStatsControllerDescribe({
    query: { enabled, refetchInterval: 15_000, staleTime: 10_000 },
  });
}

/**
 * Rolling history of the message rate per source while the page is open: one sample per
 * successful `GET /ais/stats` (the processor keeps no time series of its rates).
 */
export function useRateHistory(stats: AisStatsDto | undefined, updatedAt: number) {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<RateSample[]>(() =>
    stats ? [rateSample(stats, updatedAt)] : [],
  );
  useEffect(() => {
    const key = JSON.stringify(getStatsControllerDescribeQueryKey());
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      if (JSON.stringify(event.query.queryKey) !== key) return;
      const data = event.query.state.data as AisStatsDto | undefined;
      if (data)
        setHistory((current) =>
          pushSample(current, rateSample(data, event.query.state.dataUpdatedAt)),
        );
    });
  }, [queryClient]);
  return stats && history.length === 0 ? [rateSample(stats, updatedAt)] : history;
}

/** Open alerts by severity, domain and type (`GET /alerts/summary`). */
export function useAlertSummary(enabled: boolean) {
  return useAlertsControllerSummary({ query: { enabled, refetchInterval: 60_000 } });
}

/** Alerts of the last 7 days (newest first, at most 500) for the timeline chart. */
export function useAlertWindow(enabled: boolean, anchor: number) {
  return useAlertsControllerList(
    { from: new Date(anchor - 7 * DAY).toISOString(), limit: 500 },
    { query: { enabled, staleTime: 60_000 } },
  );
}

/** The newest alerts of the user's scope. */
export function useRecentAlerts(enabled: boolean) {
  return useAlertsControllerList({ limit: 6 }, { query: { enabled, refetchInterval: 60_000 } });
}

/** Vessels in EWS danger or warning (`GET /safety/vessels?ewsStatus=0,1`). */
export function useEwsStates(enabled: boolean) {
  return useVesselStatesControllerList(
    { ewsStatus: '0,1', limit: 5000 },
    { query: { enabled, refetchInterval: 30_000 } },
  );
}

/** Surveillance events of the last 24 hours (`GET /surveillance/stats?from`). */
export function useSurveillance24h(enabled: boolean, anchor: number) {
  return useStatisticsControllerStats(
    { from: new Date(anchor - DAY).toISOString() },
    { query: { enabled, refetchInterval: 120_000 } },
  );
}

/** CII grade distribution of the organization's fleet for the year (`GET /cii/fleet/summary`). */
export function useFleetCii(enabled: boolean, year: number) {
  return useCiiControllerFleetSummary(
    { year, pageSize: 100 },
    { query: { enabled, staleTime: 120_000, refetchInterval: 300_000, retry: false } },
  );
}

/** Vessels whose daily CII points are summed for the fuel figure (one request each). */
export const FUEL_MAX_VESSELS = 50;
const dailyKeys = serviceKeys('emission').resource('fleet-fuel');

/**
 * Fuel consumed this month and this year over the fleet (ME + AE from the daily CII points of
 * each vessel since 1 January: the emission service has no fleet fuel total).
 */
export function useFleetFuel(
  enabled: boolean,
  vessels: readonly FleetVesselCiiDto[],
  year: number,
) {
  const chosen = vessels.filter((vessel) => vessel.grade !== null).slice(0, FUEL_MAX_VESSELS);
  return useQueries({
    queries: chosen.map((vessel) => ({
      queryKey: dailyKeys.sub('daily', { mmsi: vessel.mmsi, year }),
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DailyCiiDto | null> => {
        try {
          return await ciiControllerDaily(
            String(vessel.mmsi),
            { from: `${year}-01-01T00:00:00.000Z` },
            undefined,
            signal,
          );
        } catch (error) {
          if (isApiProblem(error) && error.status === 404) return null;
          throw error;
        }
      },
      enabled,
      staleTime: 600_000,
      retry: false,
    })),
    combine: (results) => ({
      pending: results.some((result) => result.isPending),
      error: results.find((result) => result.error)?.error ?? null,
      points: results.flatMap((result) => result.data?.points ?? []),
      vessels: results.length,
    }),
  });
}

/** Month / year totals of {@link useFleetFuel} points. */
export function fuelOf(points: Parameters<typeof fuelTotals>[0], now: number) {
  return fuelTotals(points, now);
}
