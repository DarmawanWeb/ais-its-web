import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  getZonesControllerGeojsonQueryKey,
  getZonesControllerListQueryKey,
  useZonesControllerGeojson,
  useZonesControllerList,
  zonesControllerList,
} from '@/shared/api/generated/geo/zones/zones';
import type {
  CreateZoneDto,
  UpdateZoneDto,
  ZoneDto,
  ZonesControllerGeojsonParams,
  ZonesControllerListParams,
  ZoneSummaryDto,
} from '@/shared/api/generated/geo/model';
import { http } from '@/shared/api/http';
import { serviceKeys } from '@/shared/api/query-keys';

import { etagOf } from '../lib/zone-model';

/**
 * Zones of the geo service (spec §13.6). Lists and the map layer use the generated client;
 * single zones and writes go through the shared `http` instance because optimistic
 * concurrency needs the `ETag` response header and the `If-Match` request header, which the
 * generated fetchers (they return the body only) do not expose.
 */
const geoKeys = serviceKeys('geo').resource('zones');

/** Array parameters as repeated keys (`kind=a&kind=b`), as the geo service expects. */
const REPEATED = { paramsSerializer: { indexes: null } } as const;

export interface VersionedZone {
  zone: ZoneDto;
  /** Version to send back in `If-Match`. */
  etag: string;
}

function headerOf(headers: unknown, name: string): string | null {
  const record = headers as { get?: (key: string) => unknown } & Record<string, unknown>;
  const value = typeof record.get === 'function' ? record.get(name) : record[name];
  return typeof value === 'string' ? value : null;
}

export async function fetchZone(id: string, signal?: AbortSignal): Promise<VersionedZone> {
  const response = await http.get<ZoneDto>(`/api/v2/zones/${encodeURIComponent(id)}`, { signal });
  return { zone: response.data, etag: etagOf(headerOf(response.headers, 'etag'), response.data) };
}

export async function createZone(body: CreateZoneDto): Promise<VersionedZone> {
  const response = await http.post<ZoneDto>('/api/v2/zones', body);
  return { zone: response.data, etag: etagOf(headerOf(response.headers, 'etag'), response.data) };
}

/** `PATCH /zones/:id` with `If-Match` (`412 ZONE_VERSION_CONFLICT` when the zone changed since). */
export async function updateZone(
  id: string,
  body: UpdateZoneDto,
  ifMatch: string,
): Promise<VersionedZone> {
  const response = await http.patch<ZoneDto>(`/api/v2/zones/${encodeURIComponent(id)}`, body, {
    headers: { 'If-Match': ifMatch },
  });
  return { zone: response.data, etag: etagOf(headerOf(response.headers, 'etag'), response.data) };
}

/** `DELETE /zones/:id` with `If-Match`. */
export async function deleteZone(id: string, ifMatch: string): Promise<void> {
  await http.delete(`/api/v2/zones/${encodeURIComponent(id)}`, {
    headers: { 'If-Match': ifMatch },
  });
}

export function zoneQueryKey(id: string) {
  return geoKeys.detail(id);
}

/** One zone with its geometry and version. */
export function useZone(id: string | null | undefined) {
  return useQuery({
    queryKey: zoneQueryKey(id ?? ''),
    queryFn: ({ signal }) => fetchZone(id ?? '', signal),
    enabled: !!id,
    staleTime: 30_000,
  });
}

/** Page of zone summaries (`GET /zones`). */
export function useZonesList(params: ZonesControllerListParams, enabled = true) {
  return useZonesControllerList(params, {
    query: { placeholderData: keepPreviousData, staleTime: 15_000, enabled },
    request: REPEATED,
  });
}

/**
 * Every zone summary matching the filters (pages of 100, at most the per-owner quota of
 * 1 000 per scope): the list has no "global only" filter, so the global scope filters these.
 */
export function useAllZones(
  params: Omit<ZonesControllerListParams, 'page' | 'pageSize'>,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...geoKeys.list(params), 'all'],
    enabled,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      const items: ZoneSummaryDto[] = [];
      for (let page = 1; page <= 30; page += 1) {
        const result = await zonesControllerList(
          { ...params, page, pageSize: 100 },
          { ...REPEATED, signal },
        );
        items.push(...result.data);
        if (items.length >= result.meta.total || result.data.length === 0) break;
      }
      return items;
    },
  });
}

/** Map layer of the zones (`GET /zones/geojson`, budgeted FeatureCollection). */
export function useZonesGeojson(params: ZonesControllerGeojsonParams, enabled = true) {
  return useZonesControllerGeojson(params, {
    query: { placeholderData: keepPreviousData, staleTime: 15_000, enabled },
    request: REPEATED,
  });
}

/** Refetches every zone list and map layer, and drops (or replaces) the cached zone. */
export function invalidateZones(
  queryClient: QueryClient,
  changed?: VersionedZone | { deletedId: string },
) {
  if (changed && 'zone' in changed)
    queryClient.setQueryData(zoneQueryKey(changed.zone.id), changed);
  if (changed && 'deletedId' in changed)
    queryClient.removeQueries({ queryKey: zoneQueryKey(changed.deletedId) });
  void queryClient.invalidateQueries({ queryKey: getZonesControllerListQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getZonesControllerGeojsonQueryKey() });
  void queryClient.invalidateQueries({ queryKey: geoKeys.all });
}

export function useInvalidateZones() {
  const queryClient = useQueryClient();
  return useCallback(
    (changed?: VersionedZone | { deletedId: string }) => invalidateZones(queryClient, changed),
    [queryClient],
  );
}
