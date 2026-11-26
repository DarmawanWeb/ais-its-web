import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { type AlertFilters, filtersFromSearch, filtersToSearch } from '../lib/alert-filters';

/** Filters of the inbox and the selected alert, kept in the URL (shareable links). */
export function useAlertFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized query
  const filters = useMemo(() => filtersFromSearch(searchParams), [key]);
  const selectedId = searchParams.get('alert');

  const setFilters = useCallback(
    (patch: Partial<AlertFilters>) =>
      setSearchParams(
        (current) => {
          const next = filtersToSearch({ ...filtersFromSearch(current), ...patch }, current);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const resetFilters = useCallback(
    () =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams();
          const alert = current.get('alert');
          if (alert) next.set('alert', alert);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const selectAlert = useCallback(
    (id: string | null) =>
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('alert', id);
        else next.delete('alert');
        return next;
      }),
    [setSearchParams],
  );

  return { filters, setFilters, resetFilters, selectedId, selectAlert };
}
