import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Columns3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { EmptyState, ErrorState } from '../feedback';
import type { DataTablePagination, PagePagination } from './adapters';
import { CursorPaginationBar, LoadMoreBar, PagePaginationBar } from './pagination-bar';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    /** Label of the column in the visibility menu (defaults to the column id). */
    label?: string;
    /** Extra classes for header and cells (e.g. 'text-right'). */
    className?: string;
    /** Never hideable through the visibility menu. */
    alwaysVisible?: boolean;
    /** Phantom use of the generics (TanStack requires them on the interface). */
    _types?: [TData, TValue];
  }
}

export interface DataTableProps<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack column values are heterogeneous
  columns: ColumnDef<TData, any>[];
  data: readonly TData[] | undefined;
  /** First load: renders skeleton rows. */
  loading?: boolean;
  /** Error of the query (problem details are rendered). */
  error?: unknown;
  onRetry?: () => void;
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: TData) => void;
  /** Highlights the row with this id. */
  selectedRowId?: string | null;
  /** Controlled sorting; set manualSorting when the server sorts. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  /** Controlled column visibility. */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** Shows the "Columns" menu in the toolbar. */
  enableColumnVisibility?: boolean;
  pagination?: DataTablePagination;
  /** Left side of the toolbar (search, filters). */
  toolbar?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
  density?: 'default' | 'compact';
  skeletonRows?: number;
  /** Accessible name of the table. */
  ariaLabel?: string;
}

/**
 * Data table on TanStack Table: sorting, column visibility, and pagination adapters for
 * page-based and cursor-based API lists (see adapters.ts).
 */
export function DataTable<TData>({
  columns,
  data,
  loading = false,
  error,
  onRetry,
  getRowId,
  onRowClick,
  selectedRowId,
  sorting: sortingProp,
  onSortingChange,
  manualSorting = false,
  columnVisibility: visibilityProp,
  onColumnVisibilityChange,
  enableColumnVisibility = false,
  pagination,
  toolbar,
  emptyState,
  className,
  density = 'default',
  skeletonRows = 6,
  ariaLabel,
}: DataTableProps<TData>) {
  const { t } = useTranslation();
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({});
  const sorting = sortingProp ?? internalSorting;
  const columnVisibility = visibilityProp ?? internalVisibility;
  const clientPaging = pagination?.mode === 'client';

  const table = useReactTable({
    data: (data ?? []) as TData[],
    columns,
    getRowId,
    state: { sorting, columnVisibility },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onColumnVisibilityChange: onColumnVisibilityChange ?? setInternalVisibility,
    manualSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: clientPaging ? getPaginationRowModel() : undefined,
    initialState: clientPaging
      ? { pagination: { pageIndex: 0, pageSize: pagination.pageSize ?? 20 } }
      : undefined,
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns().length;
  const cellPadding = density === 'compact' ? 'py-1.5' : 'py-2.5';

  const clientPagination: PagePagination | null = clientPaging
    ? {
        mode: 'page',
        page: table.getState().pagination.pageIndex + 1,
        pageSize: table.getState().pagination.pageSize,
        total: data?.length ?? 0,
        onPageChange: (page) => table.setPageIndex(page - 1),
        onPageSizeChange: (size) => table.setPageSize(size),
      }
    : null;

  const renderBody = () => {
    if (loading && (!data || data.length === 0)) {
      return Array.from({ length: skeletonRows }, (_, index) => (
        <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
          {table.getVisibleLeafColumns().map((column) => (
            <TableCell key={column.id} className={cellPadding}>
              <Skeleton className="h-4 w-[70%]" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }
    if (error) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={visibleColumns} className="whitespace-normal">
            <ErrorState error={error} onRetry={onRetry} size="sm" />
          </TableCell>
        </TableRow>
      );
    }
    if (rows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={visibleColumns} className="whitespace-normal">
            {emptyState ?? <EmptyState title={t('table.noResults')} size="sm" />}
          </TableCell>
        </TableRow>
      );
    }
    return rows.map((row: Row<TData>) => (
      <TableRow
        key={row.id}
        data-state={selectedRowId === row.id ? 'selected' : undefined}
        className={cn(onRowClick && 'cursor-pointer')}
        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key === 'Enter') onRowClick(row.original);
              }
            : undefined
        }
        tabIndex={onRowClick ? 0 : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            className={cn(cellPadding, cell.column.columnDef.meta?.className)}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide() && !column.columnDef.meta?.alwaysVisible);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(toolbar || enableColumnVisibility) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {enableColumnVisibility && hideableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label={t('table.toggleColumns')}>
                  <Columns3 /> {t('table.columns')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t('table.toggleColumns')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {column.columnDef.meta?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-surface shadow-xs">
        <Table aria-label={ariaLabel} aria-busy={loading || undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.columnDef.meta?.className}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{renderBody()}</TableBody>
        </Table>
      </div>
      {pagination?.mode === 'page' && <PagePaginationBar pagination={pagination} />}
      {clientPagination && rows.length > 0 && <PagePaginationBar pagination={clientPagination} />}
      {pagination?.mode === 'cursor' && <CursorPaginationBar pagination={pagination} />}
      {pagination?.mode === 'load-more' && <LoadMoreBar pagination={pagination} />}
    </div>
  );
}
