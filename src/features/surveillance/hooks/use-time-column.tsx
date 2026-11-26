import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';

import type { SurveillanceEvent } from '../lib/dto';

type Column = ColumnDef<SurveillanceEvent>;

/** Time column (absolute date + relative age). */
export function useTimeColumn(header?: string): Column {
  const { t, i18n } = useTranslation('surveillance');
  return useMemo<Column>(
    () => ({
      id: 'time',
      header: header ?? t('fields.time'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col whitespace-nowrap">
          <time dateTime={row.original.time} className="text-sm">
            {formatDateTime(row.original.time, i18n.language)}
          </time>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(row.original.time, i18n.language)}
          </span>
        </span>
      ),
    }),
    [t, i18n.language, header],
  );
}
