import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FuelSeriesPointDto } from '@/shared/api/generated/telemetry/model';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';

import type { Bucket } from '../lib/range';

/** Columns of the readings table (stable per language and bucket: cells are components). */
export function useReadingColumns(bucket: Bucket): ColumnDef<FuelSeriesPointDto>[] {
  const { t, i18n } = useTranslation('telemetry');
  return useMemo<ColumnDef<FuelSeriesPointDto>[]>(() => {
    const ton = (value: number) =>
      formatNumber(value, i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const columns: ColumnDef<FuelSeriesPointDto>[] = [
      {
        id: 'time',
        accessorKey: 'time',
        header: bucket === 'raw' ? t('table.time') : t('table.bucket'),
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap tabular-nums">
            {formatDateTime(
              row.original.time,
              i18n.language,
              bucket === '1d' ? 'dd MMM yyyy' : 'dd MMM yyyy HH:mm',
            )}
          </span>
        ),
        meta: { label: t('table.time'), alwaysVisible: true },
      },
      {
        id: 'me',
        accessorKey: 'fuelMeTon',
        header: t('table.me'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{ton(row.original.fuelMeTon)}</span>
        ),
        meta: { label: t('table.me'), className: 'text-right' },
      },
      {
        id: 'ae',
        accessorKey: 'fuelAeTon',
        header: t('table.ae'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{ton(row.original.fuelAeTon)}</span>
        ),
        meta: { label: t('table.ae'), className: 'text-right' },
      },
      {
        id: 'total',
        accessorKey: 'totalFuelTon',
        header: t('table.total'),
        cell: ({ row }) => (
          <span className="font-mono font-medium tabular-nums">
            {ton(row.original.totalFuelTon)}
          </span>
        ),
        meta: { label: t('table.total'), className: 'text-right' },
      },
    ];
    if (bucket === 'raw') {
      columns.push(
        {
          id: 'period',
          header: t('table.period'),
          enableSorting: false,
          cell: ({ row }) =>
            row.original.periodStart ? (
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {formatDateTime(row.original.periodStart, i18n.language, 'HH:mm')}–
                {formatDateTime(row.original.time, i18n.language, 'HH:mm')}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { label: t('table.period') },
        },
        {
          id: 'source',
          accessorKey: 'source',
          header: t('table.source'),
          cell: ({ row }) =>
            row.original.source ? (
              <Badge variant={row.original.source === 'manual' ? 'info' : 'muted'}>
                {t(`sources.${row.original.source}`)}
              </Badge>
            ) : (
              '—'
            ),
          meta: { label: t('table.source') },
        },
        {
          id: 'device',
          accessorKey: 'deviceId',
          header: t('table.device'),
          enableSorting: false,
          cell: ({ row }) =>
            row.original.deviceId ? (
              <span
                className="font-mono text-xs text-muted-foreground"
                title={row.original.deviceId}
              >
                …{row.original.deviceId.slice(-8)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { label: t('table.device') },
        },
      );
    } else {
      columns.push({
        id: 'readings',
        accessorKey: 'readings',
        header: t('table.readings'),
        cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.readings}</span>,
        meta: { label: t('table.readings'), className: 'text-right' },
      });
    }
    return columns;
  }, [t, i18n.language, bucket]);
}
