import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CreateDeviceDto,
  DevicesControllerListKind,
  DevicesControllerListStatus,
  UpdateDeviceDto,
} from '@/shared/api/generated/telemetry/model';
import {
  devicesControllerCreate,
  devicesControllerRemove,
  devicesControllerUpdate,
  getDevicesControllerListQueryKey,
  useDevicesControllerList,
} from '@/shared/api/generated/telemetry/devices/devices';

export interface DeviceFilter {
  page: number;
  pageSize: number;
  search?: string;
  kind?: DevicesControllerListKind;
  status?: DevicesControllerListStatus;
  mmsi?: number;
  /** Platform administrators: devices of one organization (undefined = all). */
  orgId?: string;
}

/** GET /telemetry/devices (page-based, tenant-private; platform admins see all or `orgId`). */
export function useDevices(filter: DeviceFilter) {
  return useDevicesControllerList(
    {
      page: filter.page,
      pageSize: filter.pageSize,
      ...(filter.search ? { search: filter.search } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mmsi ? { mmsi: filter.mmsi } : {}),
      ...(filter.orgId ? { orgId: filter.orgId } : {}),
    },
    { query: { placeholderData: keepPreviousData, refetchInterval: 60_000 } },
  );
}

export function useDeviceMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: getDevicesControllerListQueryKey() });
  const create = useMutation({
    mutationFn: (body: CreateDeviceDto) => devicesControllerCreate(body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeviceDto }) =>
      devicesControllerUpdate(id, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => devicesControllerRemove(id),
    onSuccess,
  });
  return { create, update, remove };
}
