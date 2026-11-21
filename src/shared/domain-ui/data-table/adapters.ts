import { useCallback, useMemo, useState } from 'react';

/**
 * Pagination adapters of <DataTable/> for the two list shapes of the API (spec §5):
 *  - page-based `{ data, meta: { page, pageSize, total } }` (CRUD collections)
 *  - cursor-based `{ data, page: { nextCursor, limit } }` (time-ordered collections)
 */
export interface PagePagination {
  mode: 'page';
  /** 1-based page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface CursorPagination {
  mode: 'cursor';
  /** Index of the current page in the visited cursor stack (0 = first page). */
  pageIndex: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isFetching?: boolean;
}

export interface LoadMorePagination {
  mode: 'load-more';
  hasNextPage: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
}

export interface ClientPagination {
  mode: 'client';
  pageSize?: number;
}

export type DataTablePagination =
  PagePagination | CursorPagination | LoadMorePagination | ClientPagination;

/** State for page-based lists: `const p = usePageState(); useListVessels({ page: p.page, pageSize: p.pageSize })`. */
export function usePageState(initial: { page?: number; pageSize?: number } = {}) {
  const [page, setPage] = useState(initial.page ?? 1);
  const [pageSize, setPageSizeState] = useState(initial.pageSize ?? 20);
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);
  /** Builds the DataTable adapter from the response meta. */
  const adapter = useCallback(
    (meta: { page?: number; pageSize?: number; total: number } | undefined): PagePagination => ({
      mode: 'page',
      page: meta?.page ?? page,
      pageSize: meta?.pageSize ?? pageSize,
      total: meta?.total ?? 0,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    }),
    [page, pageSize, setPageSize],
  );
  return { page, pageSize, setPage, setPageSize, adapter };
}

/**
 * State for cursor lists with previous/next navigation: keeps the stack of visited cursors.
 *
 *   const c = useCursorState();
 *   const q = useListAlerts({ cursor: c.cursor, limit: 50 });
 *   <DataTable pagination={c.adapter(q.data?.page.nextCursor ?? null, q.isFetching)} … />
 */
export function useCursorState() {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const pageIndex = stack.length - 1;
  const cursor = stack[pageIndex] ?? null;
  const reset = useCallback(() => setStack([null]), []);
  const adapter = useCallback(
    (nextCursor: string | null | undefined, isFetching = false): CursorPagination => ({
      mode: 'cursor',
      pageIndex,
      hasPreviousPage: pageIndex > 0,
      hasNextPage: !!nextCursor,
      isFetching,
      onPrevious: () =>
        setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
      onNext: () => {
        if (nextCursor) setStack((current) => [...current, nextCursor]);
      },
    }),
    [pageIndex],
  );
  return useMemo(
    () => ({ cursor, pageIndex, reset, adapter }),
    [cursor, pageIndex, reset, adapter],
  );
}
