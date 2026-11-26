import { alertTypeLabel } from '@darmawanweb/ais-its-contracts/domain';
import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import type { SeriesRow } from '../lib/series';
import { totalsByType } from '../lib/series';
import { SURVEILLANCE_TYPES, TYPE_COLOR } from '../lib/types';

function useLabels(daily: boolean) {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'id';
  return {
    locale,
    type: (type: (typeof SURVEILLANCE_TYPES)[number]) => alertTypeLabel(type, locale),
    bucket: (iso: string) => formatDateTime(iso, i18n.language, daily ? 'dd MMM' : 'dd MMM HH:mm'),
    tick: (iso: string) => formatDateTime(iso, i18n.language, daily ? 'dd MMM' : 'HH:mm'),
    n: (value: number) => formatNumber(value, i18n.language),
  };
}

function TrendTooltip({
  active,
  payload,
  daily,
}: TooltipContentProps<number, string> & { daily: boolean }) {
  const { t } = useTranslation('surveillance');
  const labels = useLabels(daily);
  const row = payload?.[0]?.payload as SeriesRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-48 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 font-semibold">
        {labels.bucket(row.from)} – {labels.bucket(row.to)}
      </p>
      <ul className="space-y-1">
        {[...SURVEILLANCE_TYPES].reverse().map((type) => (
          <li key={type} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: TYPE_COLOR[type] }}
                aria-hidden
              />
              {labels.type(type)}
            </span>
            <span className="font-mono tabular-nums">{labels.n(row[type])}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between border-t pt-1.5 font-medium">
        {t('overview.total')} <span className="font-mono tabular-nums">{labels.n(row.total)}</span>
      </p>
    </div>
  );
}

/**
 * Events per detector type over time: stacked bars in the fixed type order (adjacent colours
 * validated for colour-vision deficiencies), a 2 px surface gap between segments, a legend with
 * totals, a hover tooltip, and a table view of the same numbers.
 */
export function TypeTrendChart({
  rows,
  loading,
  daily,
}: {
  rows: readonly SeriesRow[];
  loading: boolean;
  daily: boolean;
}) {
  const { t } = useTranslation('surveillance');
  const labels = useLabels(daily);
  const id = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const totals = totalsByType(rows);
  const top = SURVEILLANCE_TYPES[SURVEILLANCE_TYPES.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label={t('overview.legend')}>
          {SURVEILLANCE_TYPES.map((type) => (
            <li key={type} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: TYPE_COLOR[type] }}
                aria-hidden
              />
              <span className="text-muted-foreground">{labels.type(type)}</span>
              <span className="font-mono font-medium tabular-nums">{labels.n(totals[type])}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-1" role="group" aria-label={t('overview.view')}>
          <Button
            variant={view === 'chart' ? 'subtle' : 'ghost'}
            size="xs"
            aria-pressed={view === 'chart'}
            onClick={() => setView('chart')}
          >
            <BarChart3 /> {t('overview.chartView')}
          </Button>
          <Button
            variant={view === 'table' ? 'subtle' : 'ghost'}
            size="xs"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <Table2 /> {t('overview.tableView')}
          </Button>
        </div>
      </div>
      {loading && rows.every((row) => !row.loaded) ? (
        <Skeleton className="h-64 w-full" />
      ) : view === 'chart' ? (
        <figure aria-labelledby={`${id}-caption`} className="h-64 min-w-0">
          <figcaption id={`${id}-caption`} className="sr-only">
            {t('overview.chartCaption')}
          </figcaption>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...rows]}
              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
              barCategoryGap="22%"
            >
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="from"
                tickFormatter={labels.tick}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                minTickGap={16}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                content={(props) => (
                  <TrendTooltip {...(props as TooltipContentProps<number, string>)} daily={daily} />
                )}
              />
              {SURVEILLANCE_TYPES.map((type) => (
                <Bar
                  key={type}
                  dataKey={type}
                  name={labels.type(type)}
                  stackId="types"
                  fill={TYPE_COLOR[type]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  radius={type === top ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </figure>
      ) : (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <Table aria-label={t('overview.chartCaption')}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('overview.period')}</TableHead>
                {SURVEILLANCE_TYPES.map((type) => (
                  <TableHead key={type} className="text-right">
                    {labels.type(type)}
                  </TableHead>
                ))}
                <TableHead className="text-right">{t('overview.total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.from}>
                  <TableCell className="whitespace-nowrap">{labels.bucket(row.from)}</TableCell>
                  {SURVEILLANCE_TYPES.map((type) => (
                    <TableCell key={type} className="text-right font-mono tabular-nums">
                      {row.loaded ? labels.n(row[type]) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {row.loaded ? labels.n(row.total) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Counts by a dimension (severity, review status) as labelled horizontal bars. */
export function BreakdownBars({
  items,
  total,
  className,
}: {
  items: { key: string; label: React.ReactNode; value: number; className: string }[];
  total: number;
  className?: string;
}) {
  const { i18n } = useTranslation();
  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item) => {
        const percent = total > 0 ? (item.value / total) * 100 : 0;
        return (
          <li key={item.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-mono tabular-nums">
                {formatNumber(item.value, i18n.language)}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {formatNumber(percent, i18n.language, { maximumFractionDigits: 0 })} %
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className={cn('h-full rounded-full', item.className)}
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
