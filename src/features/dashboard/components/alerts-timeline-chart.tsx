import { ALERT_SEVERITY_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { useId } from 'react';
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

import { useAppLanguage } from '@/shared/i18n';
import type { AlertDayRow } from '../lib/dashboard';

/** Severity order bottom → top and their semantic colours (also used by the badges). */
const SEVERITIES = [
  { key: 'info', color: 'var(--info)' },
  { key: 'warning', color: 'var(--warning)' },
  { key: 'critical', color: 'var(--danger)' },
] as const;

function DayTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = useAppLanguage();
  const row = payload?.[0]?.payload as AlertDayRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 font-semibold">
        {formatDateTime(row.day, i18n.language, 'EEEE, dd MMM')}
      </p>
      <ul className="space-y-1">
        {[...SEVERITIES].reverse().map(({ key, color }) => (
          <li key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
              {ALERT_SEVERITY_LABELS[key][locale]}
            </span>
            <span className="font-mono tabular-nums">{formatNumber(row[key], i18n.language)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between border-t pt-1.5 font-medium">
        {t('alertsChart.total')}{' '}
        <span className="font-mono tabular-nums">{formatNumber(row.total, i18n.language)}</span>
      </p>
    </div>
  );
}

/** Alerts per day of the last 7 days, stacked by severity, with a legend of totals. */
export function AlertsTimelineChart({ rows }: { rows: readonly AlertDayRow[] }) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = useAppLanguage();
  const id = useId();
  const totals = Object.fromEntries(
    SEVERITIES.map(({ key }) => [key, rows.reduce((sum, row) => sum + row[key], 0)]),
  ) as Record<(typeof SEVERITIES)[number]['key'], number>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label={t('alertsChart.legend')}>
        {[...SEVERITIES].reverse().map(({ key, color }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
            <span className="text-muted-foreground">{ALERT_SEVERITY_LABELS[key][locale]}</span>
            <span className="font-mono font-medium tabular-nums">
              {formatNumber(totals[key], i18n.language)}
            </span>
          </li>
        ))}
      </ul>
      <figure aria-labelledby={`${id}-caption`} className="h-60 min-w-0">
        <figcaption id={`${id}-caption`} className="sr-only">
          {t('alertsChart.caption')}
        </figcaption>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...rows]}
            margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
            barCategoryGap="24%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => formatDateTime(day, i18n.language, 'EEE dd')}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={(props) => (
                <DayTooltip {...(props as TooltipContentProps<number, string>)} />
              )}
            />
            {SEVERITIES.map(({ key, color }, index) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="severity"
                fill={color}
                stroke="var(--surface)"
                strokeWidth={2}
                radius={index === SEVERITIES.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </figure>
      <table className="sr-only">
        <caption>{t('alertsChart.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('alertsChart.day')}</th>
            {SEVERITIES.map(({ key }) => (
              <th key={key} scope="col">
                {ALERT_SEVERITY_LABELS[key][locale]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th scope="row">{formatDateTime(row.day, i18n.language, 'dd MMM')}</th>
              {SEVERITIES.map(({ key }) => (
                <td key={key}>{row[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
