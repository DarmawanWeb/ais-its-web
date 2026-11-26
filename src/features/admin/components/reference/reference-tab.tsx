import type { ColumnDef } from '@tanstack/react-table';
import { Database, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { PagePagination } from '@/shared/domain-ui/data-table';
import { DataTable } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

import { SearchInput } from '../common';

export interface ReferenceTabProps<T extends { id: string }> {
  /** Accessible name of the table. */
  label: string;
  columns: ColumnDef<T>[];
  rows: readonly T[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  pagination: PagePagination;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  toolbar?: ReactNode;
  /** reference:write (super admin): create / edit / delete actions. */
  canWrite: boolean;
  createLabel: string;
  onCreate: () => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  rowName: (row: T) => string;
  emptyTitle: string;
  emptyHint: string;
}

/** A reference-data table with search and, for reference writers, row actions. */
export function ReferenceTab<T extends { id: string }>({
  label,
  columns,
  rows,
  loading,
  error,
  onRetry,
  pagination,
  search,
  onSearch,
  searchPlaceholder,
  toolbar,
  canWrite,
  createLabel,
  onCreate,
  onEdit,
  onDelete,
  rowName,
  emptyTitle,
  emptyHint,
}: ReferenceTabProps<T>) {
  const { t } = useTranslation('admin');
  const allColumns = useMemo<ColumnDef<T>[]>(
    () =>
      canWrite
        ? [
            ...columns,
            {
              id: 'actions',
              header: () => <span className="sr-only">{t('common.actions')}</span>,
              meta: { className: 'text-right', alwaysVisible: true },
              cell: ({ row }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('reference.rowActions', { name: rowName(row.original) })}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => onEdit(row.original)}>
                      <Pencil /> {t('common:actions.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-danger focus:bg-danger/10 focus:text-danger"
                      onSelect={() => onDelete(row.original)}
                    >
                      <Trash2 className="text-danger" /> {t('common:actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]
        : columns,
    [canWrite, columns, onDelete, onEdit, rowName, t],
  );

  return (
    <DataTable
      ariaLabel={label}
      columns={allColumns}
      data={rows}
      loading={loading}
      error={error}
      onRetry={onRetry}
      getRowId={(row) => row.id}
      pagination={pagination}
      toolbar={
        <>
          <SearchInput
            value={search}
            onChange={onSearch}
            label={t('reference.search')}
            placeholder={searchPlaceholder}
          />
          {toolbar}
          {canWrite && (
            <Button size="sm" onClick={onCreate} className="sm:ml-auto">
              <Plus /> {createLabel}
            </Button>
          )}
        </>
      }
      emptyState={
        <EmptyState
          size="sm"
          icon={Database}
          title={search ? t('reference.noMatches') : emptyTitle}
          description={search ? t('reference.noMatchesHint') : emptyHint}
        />
      }
    />
  );
}
