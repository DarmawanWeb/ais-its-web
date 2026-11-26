import {
  keepPreviousData,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import {
  enginesControllerCreate,
  enginesControllerRemove,
  enginesControllerUpdate,
  getEnginesControllerListQueryKey,
  useEnginesControllerList,
} from '@/shared/api/generated/fleet/engines/engines';
import {
  fuelFormulasControllerCreate,
  fuelFormulasControllerRemove,
  fuelFormulasControllerUpdate,
  getFuelFormulasControllerListQueryKey,
  useFuelFormulasControllerList,
} from '@/shared/api/generated/fleet/fuel-formulas/fuel-formulas';
import {
  fuelsControllerCreate,
  fuelsControllerRemove,
  fuelsControllerUpdate,
  getFuelsControllerListQueryKey,
  useFuelsControllerList,
} from '@/shared/api/generated/fleet/fuels/fuels';
import type {
  CreateEngineDto,
  CreateFuelDto,
  CreateFuelFormulaDto,
  CreatePortDto,
  CreateVesselTypeDto,
  EnginesControllerListKind,
  UpdateEngineDto,
  UpdateFuelDto,
  UpdateFuelFormulaDto,
  UpdatePortDto,
  UpdateVesselTypeDto,
} from '@/shared/api/generated/fleet/model';
import {
  getPortsControllerListQueryKey,
  portsControllerCreate,
  portsControllerRemove,
  portsControllerUpdate,
  usePortsControllerList,
} from '@/shared/api/generated/fleet/ports/ports';
import { useRegistryControllerSearch } from '@/shared/api/generated/fleet/registry/registry';
import {
  getVesselTypesControllerListQueryKey,
  useVesselTypesControllerList,
  vesselTypesControllerCreate,
  vesselTypesControllerRemove,
  vesselTypesControllerUpdate,
} from '@/shared/api/generated/fleet/vessel-types/vessel-types';
import { useVesselsControllerList } from '@/shared/api/generated/fleet/vessels/vessels';

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
}

const listQuery = { query: { placeholderData: keepPreviousData } } as const;
const clean = ({ page, pageSize, search }: ListParams) => ({
  page,
  pageSize,
  ...(search ? { search } : {}),
});

export const useVesselTypes = (params: ListParams) =>
  useVesselTypesControllerList(clean(params), listQuery);
export const useFuels = (params: ListParams) => useFuelsControllerList(clean(params), listQuery);
export const useEngines = (params: ListParams & { kind?: EnginesControllerListKind }) =>
  useEnginesControllerList(
    { ...clean(params), ...(params.kind ? { kind: params.kind } : {}) },
    listQuery,
  );
export const useFuelFormulas = (params: ListParams) =>
  useFuelFormulasControllerList(clean(params), listQuery);
export const usePorts = (params: ListParams) => usePortsControllerList(clean(params), listQuery);

export function useRegistrySearch(q: string, page: number, pageSize: number) {
  return useRegistryControllerSearch(
    { q, page, pageSize },
    { query: { enabled: q.trim().length >= 2, placeholderData: keepPreviousData } },
  );
}

/** Vessels of an organization (device form; identity of every vessel for the others). */
export function useOrgVessels(orgId: string | null | undefined, enabled = true) {
  return useVesselsControllerList(
    { page: 1, pageSize: 100, ...(orgId ? { orgId } : {}) },
    { query: { enabled, staleTime: 60_000 } },
  );
}

/** Create / update / delete mutations of one reference resource, invalidating its lists. */
function useReferenceMutations<C, U>(
  listKey: QueryKey,
  api: {
    create: (body: C) => Promise<unknown>;
    update: (id: string, body: U) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
  },
) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: listKey });
  const create = useMutation({ mutationFn: (body: C) => api.create(body), onSuccess });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: U }) => api.update(id, body),
    onSuccess,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.remove(id), onSuccess });
  return { create, update, remove };
}

export const useVesselTypeMutations = () =>
  useReferenceMutations<CreateVesselTypeDto, UpdateVesselTypeDto>(
    getVesselTypesControllerListQueryKey(),
    {
      create: (body) => vesselTypesControllerCreate(body),
      update: (id, body) => vesselTypesControllerUpdate(id, body),
      remove: (id) => vesselTypesControllerRemove(id),
    },
  );

export const useFuelMutations = () =>
  useReferenceMutations<CreateFuelDto, UpdateFuelDto>(getFuelsControllerListQueryKey(), {
    create: (body) => fuelsControllerCreate(body),
    update: (id, body) => fuelsControllerUpdate(id, body),
    remove: (id) => fuelsControllerRemove(id),
  });

export const useEngineMutations = () =>
  useReferenceMutations<CreateEngineDto, UpdateEngineDto>(getEnginesControllerListQueryKey(), {
    create: (body) => enginesControllerCreate(body),
    update: (id, body) => enginesControllerUpdate(id, body),
    remove: (id) => enginesControllerRemove(id),
  });

export const useFuelFormulaMutations = () =>
  useReferenceMutations<CreateFuelFormulaDto, UpdateFuelFormulaDto>(
    getFuelFormulasControllerListQueryKey(),
    {
      create: (body) => fuelFormulasControllerCreate(body),
      update: (id, body) => fuelFormulasControllerUpdate(id, body),
      remove: (id) => fuelFormulasControllerRemove(id),
    },
  );

export const usePortMutations = () =>
  useReferenceMutations<CreatePortDto, UpdatePortDto>(getPortsControllerListQueryKey(), {
    create: (body) => portsControllerCreate(body),
    update: (id, body) => portsControllerUpdate(id, body),
    remove: (id) => portsControllerRemove(id),
  });
