import {
  useStatsControllerDescribe,
  useStatsControllerSeries,
} from '@/shared/api/generated/ais-processor/ais/ais';
import {
  useCiiControllerFleetFuel,
  useCiiControllerFleetSummary,
} from '@/shared/api/generated/emission/cii/cii';
import {
  useAlertsControllerList,
  useAlertsControllerSeries,
  useAlertsControllerSummary,
} from '@/shared/api/generated/notification/alerts/alerts';
import { useSafetyStatsControllerStats } from '@/shared/api/generated/safety/stats/stats';
import { useVesselStatesControllerList } from '@/shared/api/generated/safety/vessels/vessels';
import { useStatisticsControllerStats } from '@/shared/api/generated/surveillance/statistics/statistics';

import { rateSeries } from '../lib/dashboard';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Platform AIS statistics (`GET /ais/stats`), refreshed every 15 s. */
export function useAisStats(enabled: boolean) {
  return useStatsControllerDescribe({
    query: { enabled, refetchInterval: 15_000, staleTime: 10_000 },
  });
}

/** Message rate per source over the last 6 hours (`GET /ais/stats/series`, 5-minute buckets). */
export function useRateSeries(enabled: boolean, anchor: number) {
  return useStatsControllerSeries(
    { from: new Date(anchor - 6 * HOUR).toISOString(), bucket: '5m' },
    { query: { enabled, staleTime: 60_000, refetchInterval: 300_000, select: rateSeries } },
  );
}

/** The browser's IANA time zone, for local day buckets (`UTC` when unknown). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Open alerts by severity, domain and type (`GET /alerts/summary`). */
export function useAlertSummary(enabled: boolean) {
  return useAlertsControllerSummary({ query: { enabled, refetchInterval: 60_000 } });
}

/** Alerts per local day and severity over the last 7 days (`GET /alerts/stats/series`). */
export function useAlertSeries(enabled: boolean, anchor: number) {
  const from = new Date(anchor);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  return useAlertsControllerSeries(
    { from: from.toISOString(), bucket: '1d', groupBy: 'severity', tz: browserTimeZone() },
    { query: { enabled, staleTime: 60_000, refetchInterval: 300_000 } },
  );
}

/** The newest alerts of the user's scope. */
export function useRecentAlerts(enabled: boolean) {
  return useAlertsControllerList({ limit: 6 }, { query: { enabled, refetchInterval: 60_000 } });
}

/** Vessels in EWS danger / warning and at collision risk (`GET /safety/stats`, last 24 h). */
export function useSafetyStats(enabled: boolean) {
  return useSafetyStatsControllerStats(undefined, {
    query: { enabled, refetchInterval: 30_000 },
  });
}

/** The first vessels in EWS danger, named on the card (`GET /safety/vessels?ewsStatus=0`). */
export function useEwsDangerVessels(enabled: boolean) {
  return useVesselStatesControllerList(
    { ewsStatus: '0', limit: 3 },
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

/** Fuel and CO2 of the fleet this month and this year (`GET /cii/fleet/fuel`). */
export function useFleetFuel(enabled: boolean, year: number) {
  return useCiiControllerFleetFuel(
    { year },
    { query: { enabled, staleTime: 120_000, refetchInterval: 300_000, retry: false } },
  );
}
