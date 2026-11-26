import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useCursorState } from '@/shared/domain-ui/data-table';

import {
  DEFAULT_FILTERS,
  type EventFilters,
  filtersFromSearch,
  filtersToSearch,
} from '../lib/filters';

/**
 * Filters of a surveillance list page, kept in the URL (shareable, survives reloads), with the
 * cursor stack of the list and a stable time anchor: preset ranges are computed from the
 * anchor, which moves only when the filters change or the user refreshes, so cursor pages stay
 * consistent while paging.
 */
export function useEventFilters(defaults: EventFilters = DEFAULT_FILTERS) {
  const [search, setSearch] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(search, defaults), [search, defaults]);
  const [anchor, setAnchor] = useState(() => Date.now());
  const cursor = useCursorState();
  const { reset } = cursor;

  const setFilters = useCallback(
    (patch: Partial<EventFilters>) => {
      setSearch(
        (current) =>
          filtersToSearch({ ...filtersFromSearch(current, defaults), ...patch }, current, defaults),
        {
          replace: true,
        },
      );
      setAnchor(Date.now());
      reset();
    },
    [setSearch, defaults, reset],
  );

  const resetFilters = useCallback(() => setFilters(defaults), [setFilters, defaults]);

  /** New anchor ("now") and back to the first page. */
  const refresh = useCallback(() => {
    setAnchor(Date.now());
    reset();
  }, [reset]);

  return { filters, setFilters, resetFilters, anchor, refresh, cursor };
}
