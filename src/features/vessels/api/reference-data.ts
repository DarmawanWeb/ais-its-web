import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useEnginesControllerList } from '@/shared/api/generated/fleet/engines/engines';
import {
  getFuelFormulasControllerListQueryKey,
  useFuelFormulasControllerList,
} from '@/shared/api/generated/fleet/fuel-formulas/fuel-formulas';
import { useFuelsControllerList } from '@/shared/api/generated/fleet/fuels/fuels';
import { usePortsControllerList } from '@/shared/api/generated/fleet/ports/ports';
import { useVesselTypesControllerList } from '@/shared/api/generated/fleet/vessel-types/vessel-types';

const OPTIONS = { query: { staleTime: 10 * 60_000 } } as const;
const ALL = { pageSize: 100 } as const;

/**
 * Reference data of the vessel form (fleet catalogue, read with `vessel:read`): ship types,
 * fuels, main / auxiliary engines, first fuel formulas and ports — 100 of each (the API maximum).
 */
export function useReferenceData() {
  const types = useVesselTypesControllerList(ALL, OPTIONS);
  const fuels = useFuelsControllerList(ALL, OPTIONS);
  const mainEngines = useEnginesControllerList({ ...ALL, kind: 'main' }, OPTIONS);
  const auxEngines = useEnginesControllerList({ ...ALL, kind: 'auxiliary' }, OPTIONS);
  const formulas = useFuelFormulasControllerList(ALL, OPTIONS);
  const ports = usePortsControllerList(ALL, OPTIONS);
  const queries = [types, fuels, mainEngines, auxEngines, formulas, ports];
  return {
    types: types.data?.data ?? [],
    fuels: fuels.data?.data ?? [],
    mainEngines: mainEngines.data?.data ?? [],
    auxEngines: auxEngines.data?.data ?? [],
    formulas: formulas.data?.data ?? [],
    ports: ports.data?.data ?? [],
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => queries.forEach((query) => void query.refetch()),
  };
}

export type ReferenceData = ReturnType<typeof useReferenceData>;

/** Re-reads the formula list after a new formula was created. */
export function useRefreshFormulas() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: getFuelFormulasControllerListQueryKey() }),
    [queryClient],
  );
}
