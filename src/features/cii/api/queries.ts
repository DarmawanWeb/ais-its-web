import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';

import {
  getCiiControllerAnnualQueryKey,
  getCiiControllerCurrentQueryKey,
  getCiiControllerDailyQueryKey,
  getCiiControllerFleetSummaryQueryKey,
  getCiiControllerSegmentsQueryKey,
  useCiiControllerAnnual,
  useCiiControllerCurrent,
  useCiiControllerDaily,
  useCiiControllerFleetSummary,
  useCiiControllerRecomputeJob,
  useCiiControllerSegments,
} from '@/shared/api/generated/emission/cii/cii';
import {
  dcsControllerSummary,
  getDcsControllerSummaryQueryKey,
  useDcsControllerSummary,
} from '@/shared/api/generated/emission/emission/emission';
import type {
  CiiControllerFleetSummaryParams,
  CiiControllerSegmentsParams,
} from '@/shared/api/generated/emission/model';
import { useReductionFactorsControllerList } from '@/shared/api/generated/emission/reduction-factors/reduction-factors';
import { useVesselsControllerList } from '@/shared/api/generated/fleet/vessels/vessels';
import { claimsCanAccessOrg, useSessionStore } from '@/shared/auth';
import { useCiiUpdates } from '@/shared/realtime';

import { yearRange } from '../lib/years';

/** Fleet grade distribution + one page of vessels (`GET /cii/fleet/summary`). */
export function useFleetSummary(params: CiiControllerFleetSummaryParams, enabled = true) {
  return useCiiControllerFleetSummary(params, {
    query: { placeholderData: keepPreviousData, enabled },
  });
}

/** Year-to-date CII of a vessel (+ projection for the current year). */
export function useVesselCurrent(mmsi: number, year: number) {
  return useCiiControllerCurrent(String(mmsi), { year }, { query: { enabled: mmsi > 0 } });
}

/** Daily points of a calendar year (cumulative attained, rating and grade). */
export function useVesselDaily(mmsi: number, year: number) {
  const range = useMemo(() => yearRange(year), [year]);
  return useCiiControllerDaily(String(mmsi), range, { query: { enabled: mmsi > 0 } });
}

/** Annual history (segments or manual records) with the absolute grade boundaries per year. */
export function useVesselAnnual(mmsi: number) {
  return useCiiControllerAnnual(String(mmsi), { query: { enabled: mmsi > 0 } });
}

/**
 * The CSV-capable endpoints are typed `Dto | string` (emission 0.2 documents `text/csv`); the
 * queries ask for JSON, so a string answer is an error.
 */
function jsonOnly<T extends object>(data: T | string): T {
  if (typeof data === 'string') throw new Error('Expected JSON, received text');
  return data;
}

/** One cursor page of voyage segments, newest first. */
export function useVesselSegments(mmsi: number, params: CiiControllerSegmentsParams) {
  return useCiiControllerSegments(String(mmsi), params, {
    query: { enabled: mmsi > 0, placeholderData: keepPreviousData, select: jsonOnly },
  });
}

/** IMO DCS-style annual summary (JSON). */
export function useDcsSummary(mmsi: number, year: number) {
  return useDcsControllerSummary(
    String(mmsi),
    { year },
    { query: { enabled: mmsi > 0, select: jsonOnly } },
  );
}

/** Reduction factors Z per year with their sources. */
export function useReductionFactors() {
  return useReductionFactorsControllerList({ query: { staleTime: 5 * 60_000 } });
}

/** Recomputation job; polled every 2 s while it runs. */
export function useRecomputeJob(id: string | null) {
  return useCiiControllerRecomputeJob(id ?? '', {
    query: {
      enabled: !!id,
      refetchInterval: (query) => (query.state.data?.status === 'running' ? 2_000 : false),
    },
  });
}

/**
 * Identity of a vessel (name, type, flag) from the fleet service: `GET /vessels?search=<mmsi>`
 * matches exactly that MMSI (fleet README, 9-digit search = MMSI range of one).
 */
export function useVesselIdentity(mmsi: number) {
  const query = useVesselsControllerList(
    { search: String(mmsi), pageSize: 5 },
    { query: { enabled: mmsi > 0, staleTime: 5 * 60_000 } },
  );
  const vessel = query.data?.data.find((item) => item.mmsi === mmsi) ?? null;
  return { vessel, isPending: query.isPending, error: query.error };
}

/** Downloads the DCS summary as CSV (`Accept: text/csv`, RFC 4180 from the service). */
export async function downloadDcsCsv(mmsi: number, year: number): Promise<void> {
  const csv = (await dcsControllerSummary(
    String(mmsi),
    { year },
    { headers: { Accept: 'text/csv' }, responseType: 'text' },
  )) as unknown;
  const text = typeof csv === 'string' ? csv : JSON.stringify(csv);
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dcs-${mmsi}-${year}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Every cached emission query of one vessel (after a manual record, a recomputation…). */
export function useInvalidateVessel() {
  const queryClient = useQueryClient();
  return (mmsi: number) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getCiiControllerCurrentQueryKey(String(mmsi)) }),
      queryClient.invalidateQueries({ queryKey: getCiiControllerDailyQueryKey(String(mmsi)) }),
      queryClient.invalidateQueries({ queryKey: getCiiControllerAnnualQueryKey(String(mmsi)) }),
      queryClient.invalidateQueries({ queryKey: getCiiControllerSegmentsQueryKey(String(mmsi)) }),
      queryClient.invalidateQueries({ queryKey: getDcsControllerSummaryQueryKey(String(mmsi)) }),
      queryClient.invalidateQueries({ queryKey: getCiiControllerFleetSummaryQueryKey() }),
    ]);
}

/**
 * Live CII (spec §9 `cii:updated` to `org:<orgId>`): refetches the fleet summary, and the
 * figures of `mmsi` when given, at most every 3 s. Returns nothing; the queries re-render.
 */
export function useLiveCii(mmsi?: number, onUpdate?: (at: Date) => void) {
  const queryClient = useQueryClient();
  const claims = useSessionStore((state) => state.claims);
  const last = useRef(0);
  useCiiUpdates((update) => {
    // Tenant rule (spec §8.5): never react to figures of an organization the user cannot see.
    if (!claimsCanAccessOrg(claims, update.orgId)) return;
    if (mmsi !== undefined && update.mmsi !== mmsi) return;
    const now = Date.now();
    onUpdate?.(new Date());
    if (now - last.current < 3_000) return;
    last.current = now;
    void queryClient.invalidateQueries({ queryKey: getCiiControllerFleetSummaryQueryKey() });
    if (mmsi !== undefined) {
      void queryClient.invalidateQueries({
        queryKey: getCiiControllerCurrentQueryKey(String(mmsi)),
      });
      void queryClient.invalidateQueries({ queryKey: getCiiControllerDailyQueryKey(String(mmsi)) });
      void queryClient.invalidateQueries({
        queryKey: getCiiControllerAnnualQueryKey(String(mmsi)),
      });
    }
  });
}
