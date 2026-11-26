import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { MmsiText } from '@/shared/domain-ui/values';
import { formatNumber } from '@/shared/lib/format';

import { FlagText } from '../components/flag-text';
import { CiiCell, LastSeenCell } from '../components/vessel-table-cells';
import { TechnicalHidden } from '../components/technical-hidden';
import { VesselPhoto } from '../components/vessel-photo';
import { VesselStatusBadge } from '../components/vessel-status-badge';
import { type AnyVessel, isDetailView } from '../lib/vessel';

/** Columns of the fleet list (photo, name, MMSI, IMO, type, flag, GT/DWT, CII, last seen). */
export function useVesselColumns({ ciiVisible }: { ciiVisible: boolean }): ColumnDef<AnyVessel>[] {
  const { t, i18n } = useTranslation('vessels');
  return useMemo<ColumnDef<AnyVessel>[]>(() => {
    const columns: ColumnDef<AnyVessel>[] = [
      {
        id: 'photo',
        header: () => <span className="sr-only">{t('columns.photo')}</span>,
        cell: ({ row }) => (
          <VesselPhoto url={row.original.photoUrl} name={row.original.name} size="sm" />
        ),
        enableSorting: false,
        meta: { label: t('columns.photo'), className: 'w-20' },
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('columns.name'),
        cell: ({ row }) => (
          <div className="flex min-w-40 flex-col gap-1">
            <span className="font-medium text-foreground">{row.original.name}</span>
            <span className="flex items-center gap-2">
              <VesselStatusBadge status={row.original.status} />
              <span className="font-mono text-xs text-muted-foreground md:hidden">
                {row.original.mmsi}
              </span>
            </span>
          </div>
        ),
        meta: { label: t('columns.name'), alwaysVisible: true },
      },
      {
        id: 'mmsi',
        accessorKey: 'mmsi',
        header: t('columns.mmsi'),
        cell: ({ row }) => <MmsiText mmsi={row.original.mmsi} copyable />,
        meta: { label: t('columns.mmsi') },
      },
      {
        id: 'imo',
        accessorKey: 'imo',
        header: t('columns.imo'),
        cell: ({ row }) =>
          row.original.imo ? (
            <span className="font-mono text-sm tabular-nums">{row.original.imo}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        meta: { label: t('columns.imo') },
      },
      {
        id: 'type',
        accessorFn: (vessel) => vessel.type.name,
        header: t('columns.type'),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.type.name}</span>,
        meta: { label: t('columns.type') },
      },
      {
        id: 'flag',
        accessorKey: 'flag',
        header: t('columns.flag'),
        cell: ({ row }) => <FlagText code={row.original.flag} showName={false} />,
        meta: { label: t('columns.flag') },
      },
      {
        id: 'tonnage',
        header: t('columns.tonnage'),
        enableSorting: false,
        cell: ({ row }) => {
          const vessel = row.original;
          if (!isDetailView(vessel)) return <TechnicalHidden />;
          const { gt, dwt } = vessel.dimensions;
          return (
            <span className="font-mono text-sm whitespace-nowrap tabular-nums">
              {formatNumber(gt ?? null, i18n.language, { maximumFractionDigits: 0 })}
              <span className="px-1 text-muted-foreground">/</span>
              {formatNumber(dwt ?? null, i18n.language, { maximumFractionDigits: 0 })}
            </span>
          );
        },
        meta: { label: t('columns.tonnage'), className: 'text-right' },
      },
    ];
    if (ciiVisible) {
      columns.push({
        id: 'cii',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('columns.cii')} <MethodInfo methodId="cii.rating_grade" />
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) =>
          isDetailView(row.original) ? <CiiCell mmsi={row.original.mmsi} /> : <TechnicalHidden />,
        meta: { label: t('columns.cii') },
      });
    }
    columns.push({
      id: 'lastSeen',
      header: t('columns.lastSeen'),
      enableSorting: false,
      cell: ({ row }) => <LastSeenCell mmsi={row.original.mmsi} />,
      meta: { label: t('columns.lastSeen') },
    });
    return columns;
  }, [t, i18n.language, ciiVisible]);
}
