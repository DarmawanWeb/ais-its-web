import { VESSEL_STATUSES, type VesselStatus } from '@darmawanweb/ais-its-contracts/domain';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export type VesselScope = 'fleet' | 'all';

export interface VesselListState {
  search: string;
  typeCode: string;
  status: VesselStatus | '';
  scope: VesselScope;
  page: number;
  pageSize: number;
}

const PAGE_SIZES = [10, 20, 50, 100];
const TYPE_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Parses the list state of the URL (`?q&type&status&scope&page&size`), ignoring bad values. */
export function listStateFromSearch(params: URLSearchParams, hasOrg: boolean): VesselListState {
  const status = params.get('status');
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? 1);
  const size = Number(params.get('size') ?? 20);
  const scope = params.get('scope');
  return {
    search: (params.get('q') ?? '').slice(0, 120),
    typeCode: TYPE_CODE.test(type) ? type : '',
    status: (VESSEL_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as VesselStatus)
      : '',
    scope: !hasOrg ? 'all' : scope === 'all' ? 'all' : 'fleet',
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: PAGE_SIZES.includes(size) ? size : 20,
  };
}

/** Writes the list state into a copy of `base` (defaults omitted). */
export function listStateToSearch(state: VesselListState, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const set = (key: string, value: string | null) =>
    value === null ? next.delete(key) : next.set(key, value);
  set('q', state.search.trim() || null);
  set('type', state.typeCode || null);
  set('status', state.status || null);
  set('scope', state.scope === 'all' ? 'all' : null);
  set('page', state.page > 1 ? String(state.page) : null);
  set('size', state.pageSize !== 20 ? String(state.pageSize) : null);
  return next;
}

/** List filters and page kept in the URL (shareable, survives reloads). */
export function useVesselListState(hasOrg: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.toString();
  const state = useMemo(() => listStateFromSearch(new URLSearchParams(key), hasOrg), [key, hasOrg]);
  const update = useCallback(
    (patch: Partial<VesselListState>) => {
      setSearchParams(
        (current) => {
          const merged = { ...listStateFromSearch(current, hasOrg), ...patch };
          // Any filter change starts again at the first page.
          if (!('page' in patch)) merged.page = 1;
          return listStateToSearch(merged, current);
        },
        { replace: true },
      );
    },
    [setSearchParams, hasOrg],
  );
  return { state, update };
}
