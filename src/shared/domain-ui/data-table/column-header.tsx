import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

/** Sortable header cell: `header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />`. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!column.getCanSort()) return <span className={className}>{title}</span>;
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        '-ml-1.5 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 tracking-wide uppercase hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        sorted && 'text-foreground',
        className,
      )}
      aria-label={
        typeof title === 'string'
          ? `${title}: ${sorted === 'asc' ? t('table.sortDescending') : t('table.sortAscending')}`
          : undefined
      }
    >
      {title}
      <Icon className={cn('size-3.5', !sorted && 'opacity-50')} aria-hidden />
    </button>
  );
}
