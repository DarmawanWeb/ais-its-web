import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SeverityBadge } from '@/shared/domain-ui/badges';
import { DataTable, type DataTablePagination } from '@/shared/domain-ui/data-table';

import type { SurveillanceEvent } from '../lib/dto';
import { useTimeColumn } from '../hooks/use-time-column';
import { EventStatusBadge, VesselCell } from './bits';

type Column = ColumnDef<SurveillanceEvent>;

/**
 * Cursor-paged table of surveillance events: time, vessel (and the other vessel of a pair),
 * detector-specific columns, then severity and review status. Rows open the detail (keyboard
 * too).
 */
export function EventsTable({
  events,
  loading,
  error,
  onRetry,
  pagination,
  columns: extraColumns,
  onRowClick,
  selectedId,
  emptyState,
  showRelated = false,
  ariaLabel,
  toolbar,
  timeHeader,
}: {
  events: SurveillanceEvent[] | undefined;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  pagination?: DataTablePagination;
  columns?: Column[];
  onRowClick?: (event: SurveillanceEvent) => void;
  selectedId?: string | null;
  emptyState?: ReactNode;
  showRelated?: boolean;
  ariaLabel: string;
  toolbar?: ReactNode;
  /** Header of the time column (dark vessels: the last sighting). */
  timeHeader?: string;
}) {
  const { t } = useTranslation('surveillance');
  const timeColumn = useTimeColumn(timeHeader);
  const columns = useMemo<Column[]>(
    () => [
      timeColumn,
      {
        id: 'vessel',
        header: showRelated ? t('fields.pair') : t('fields.vessel'),
        enableSorting: false,
        cell: ({ row }) =>
          showRelated ? (
            <span className="flex w-44 min-w-0 flex-col gap-1">
              <VesselCell mmsi={row.original.mmsi} name={row.original.vesselName} />
              <VesselCell mmsi={row.original.relatedMmsi} name={row.original.relatedVesselName} />
            </span>
          ) : (
            <VesselCell mmsi={row.original.mmsi} name={row.original.vesselName} className="w-44" />
          ),
      },
      ...(extraColumns ?? []),
      {
        // Current severity and review status share one column (two stacked badges, each with
        // its own icon/label), which keeps every detector's table within 1 440 px.
        id: 'assessment',
        header: () => (
          <span className="flex flex-col leading-tight">
            <span>{t('fields.severity')}</span>
            <span className="sr-only"> · </span>
            <span>{t('fields.review')}</span>
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-1">
            <SeverityBadge severity={row.original.currentSeverity} />
            <EventStatusBadge status={row.original.status} />
          </span>
        ),
      },
    ],
    [timeColumn, extraColumns, showRelated, t],
  );

  return (
    <DataTable
      columns={columns}
      data={events}
      loading={loading}
      error={error}
      onRetry={onRetry}
      getRowId={(event) => event.id}
      onRowClick={onRowClick}
      selectedRowId={selectedId ?? null}
      pagination={pagination}
      emptyState={emptyState}
      density="compact"
      ariaLabel={ariaLabel}
      toolbar={toolbar}
    />
  );
}
