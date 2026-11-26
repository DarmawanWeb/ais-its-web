import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { DataTable, type PagePagination } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { MmsiText } from '@/shared/domain-ui/values';
import { cn } from '@/shared/lib/utils';

import { useCiiFormat } from '../hooks/use-cii-format';
import type { FleetRow } from '../lib/fleet-rows';
import { isGrade, ratingTrend } from '../lib/grades';
import { CiiUnit, SourceBadge } from './bits';
import { GradeChip } from './grade';

function TrendCell({ row, previousYear }: { row: FleetRow; previousYear: number }) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const trend = ratingTrend(row.rating, row.previous?.rating);
  if (!trend) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('trend.none', { year: previousYear })}
      </span>
    );
  }
  const Icon =
    trend.direction === 'better'
      ? ArrowDownRight
      : trend.direction === 'worse'
        ? ArrowUpRight
        : Minus;
  const previousGrade = isGrade(row.previous?.grade) ? row.previous.grade : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium',
          trend.direction === 'better' && 'text-success',
          trend.direction === 'worse' && 'text-danger',
          trend.direction === 'same' && 'text-muted-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {t(`trend.${trend.direction}`)}
        <span className="font-mono tabular-nums">{format.signedPercent(trend.percent)}</span>
      </span>
      {previousGrade && isGrade(row.grade) && previousGrade !== row.grade && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {t('trend.gradeChange', { year: previousYear })}
          <span className="font-mono font-semibold text-foreground">{previousGrade}</span>
          <ArrowRight className="size-3" aria-hidden />
          <span className="font-mono font-semibold text-foreground">{row.grade}</span>
        </span>
      )}
    </span>
  );
}

/** Vessels of the fleet with their CII of the year (server-side pages ordered by MMSI). */
export function FleetTable({
  rows,
  loading,
  error,
  onRetry,
  pagination,
  year,
}: {
  rows: FleetRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  pagination: PagePagination | undefined;
  year: number;
}) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<FleetRow>[]>(
    () => [
      {
        id: 'vessel',
        header: t('columns.vessel'),
        meta: { label: t('columns.vessel'), alwaysVisible: true },
        cell: ({ row }) => (
          <span className="flex min-w-40 flex-col">
            <span className="font-medium">{row.original.name}</span>
            <MmsiText mmsi={row.original.mmsi} className="text-xs text-muted-foreground" />
          </span>
        ),
      },
      {
        id: 'grade',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('columns.grade')} <MethodInfo methodId="cii.rating_grade" />
          </span>
        ),
        meta: { label: t('columns.grade') },
        cell: ({ row }) => (
          <GradeChip grade={isGrade(row.original.grade) ? row.original.grade : null} showLabel />
        ),
      },
      {
        id: 'rating',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('columns.rating')} <MethodInfo methodId="cii.rating_grade" />
          </span>
        ),
        meta: { label: t('columns.rating'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.rating(row.original.rating)}</span>
        ),
      },
      {
        id: 'attained',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('columns.attained')} <MethodInfo methodId="cii.attained_accumulation" />
          </span>
        ),
        meta: { label: t('columns.attained'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.cii(row.original.attained)}</span>
        ),
      },
      {
        id: 'required',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('columns.required')} <MethodInfo methodId="cii.required" />
          </span>
        ),
        meta: { label: t('columns.required'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-muted-foreground tabular-nums">
            {format.cii(row.original.required)}
          </span>
        ),
      },
      {
        id: 'trend',
        header: t('columns.trend', { year: year - 1 }),
        meta: { label: t('columns.trend', { year: year - 1 }) },
        cell: ({ row }) => <TrendCell row={row.original} previousYear={year - 1} />,
      },
      {
        id: 'source',
        header: t('columns.source'),
        meta: { label: t('columns.source') },
        cell: ({ row }) => <SourceBadge source={row.original.source} />,
      },
    ],
    [t, format, year],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        error={error}
        onRetry={onRetry}
        getRowId={(row) => String(row.mmsi)}
        onRowClick={(row) => void navigate(`/cii/vessels/${row.mmsi}?year=${year}`)}
        pagination={pagination}
        ariaLabel={t('fleet.tableLabel', { year })}
        enableColumnVisibility
        emptyState={
          <EmptyState
            size="sm"
            title={t('fleet.emptyTitle')}
            description={t('fleet.emptyDescription')}
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        {t('fleet.unitNote')} <CiiUnit />
      </p>
    </div>
  );
}
