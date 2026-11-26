import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import {
  useCiiControllerAnnual,
  useCiiControllerFleetSummary,
} from '@/shared/api/generated/emission/cii/cii';
import type {
  SeempControllerListScenariosParams,
  SeempControllerRecommendationsParams,
} from '@/shared/api/generated/emission/model';
import {
  getSeempControllerListScenariosQueryKey,
  useSeempControllerGetScenario,
  useSeempControllerListScenarios,
  useSeempControllerMeasures,
  useSeempControllerRecommendations,
} from '@/shared/api/generated/emission/seemp/seemp';
import { useVesselsControllerList } from '@/shared/api/generated/fleet/vessels/vessels';
import { usePermission } from '@/shared/auth';

/** The 12 legacy SEEMP measures with their reduction and cost models (static catalog). */
export function useMeasures() {
  return useSeempControllerMeasures({ query: { staleTime: 10 * 60_000 } });
}

/** Recommended measures of a vessel (grades A–C after, cheapest first). */
export function useRecommendations(mmsi: number, params: SeempControllerRecommendationsParams) {
  return useSeempControllerRecommendations(String(mmsi), params, {
    query: { enabled: mmsi > 0, placeholderData: keepPreviousData },
  });
}

/** Saved scenarios of the organization (optionally of one vessel), newest first. */
export function useScenarios(params: SeempControllerListScenariosParams) {
  return useSeempControllerListScenarios(params, { query: { placeholderData: keepPreviousData } });
}

export function useScenario(id: string | null) {
  return useSeempControllerGetScenario(id ?? '', { query: { enabled: !!id } });
}

export function useInvalidateScenarios() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: getSeempControllerListScenariosQueryKey() });
}

/**
 * Vessels of the organization with their current CII grade, for picking a vessel. Uses the
 * CII fleet summary (`cii:read`, which every `seemp:read` role has in the §8.4 matrix).
 */
export function useFleetVessels(params: { page: number; pageSize: number }) {
  const allowed = usePermission('cii:read');
  const query = useCiiControllerFleetSummary(params, {
    query: { enabled: allowed, placeholderData: keepPreviousData },
  });
  return { ...query, allowed };
}

/** CO2 of the baseline year from the annual CII history (for the cost per tonne avoided). */
export function useBaselineCo2(mmsi: number, baselineYear: number | null | undefined) {
  const allowed = usePermission('cii:read');
  const annual = useCiiControllerAnnual(String(mmsi), { query: { enabled: allowed && mmsi > 0 } });
  const year = annual.data?.years.find((item) => item.year === baselineYear);
  return year?.co2Ton ?? null;
}

/** Vessel identity (fleet service: `GET /vessels?search=<mmsi>` matches exactly that MMSI). */
export function useVesselIdentity(mmsi: number) {
  const query = useVesselsControllerList(
    { search: String(mmsi), pageSize: 5 },
    { query: { enabled: mmsi > 0, staleTime: 5 * 60_000 } },
  );
  return query.data?.data.find((item) => item.mmsi === mmsi) ?? null;
}
