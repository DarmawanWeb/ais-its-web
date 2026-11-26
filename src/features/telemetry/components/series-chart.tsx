import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import type { FuelSeriesPointDto } from '@/shared/api/generated/telemetry/model';
import { formatDateTime, formatNumber } from '@/shared/lib/format';

import type { Bucket } from '../lib/range';

const COLORS = { me: 'var(--chart-1)', ae: 'var(--chart-3)' } as const;

function pattern(bucket: Bucket, axis: boolean) {
  if (bucket === '1d') return axis ? 'dd MMM' : 'EEEE, dd MMM yyyy';
  return axis ? 'dd MMM HH:mm' : 'dd MMM yyyy HH:mm';
}

function ChartTooltip({
  active,
  payload,
  bucket,
}: TooltipContentProps<number, string> & { bucket: Bucket }) {
  const { t, i18n } = useTranslation('telemetry');
  const point = payload?.[0]?.payload as FuelSeriesPointDto | undefined;
  if (!active || !point) return null;
  const n = (value: number) => formatNumber(value, i18n.language, { maximumFractionDigits: 3 });
  return (
    <div className="min-w-44 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 font-semibold">
        {formatDateTime(point.time, i18n.language, pattern(bucket, false))}
      </p>
      <ul className="space-y-1">
        {(
          [
            ['me', t('series.me'), point.fuelMeTon],
            ['ae', t('series.ae'), point.fuelAeTon],
          ] as const
        ).map(([key, label, value]) => (
          <li key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: COLORS[key] }}
                aria-hidden
              />
              {label}
            </span>
            <span className="font-mono tabular-nums">{n(value)} t</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between gap-4 border-t pt-1.5 font-medium">
        {t('series.total')}{' '}
        <span className="font-mono tabular-nums">{n(point.totalFuelTon)} t</span>
      </p>
      {bucket !== 'raw' && (
        <p className="mt-1 text-muted-foreground">
          {t('series.readingsInBucket', { count: point.readings })}
        </p>
      )}
    </div>
  );
}

/** Most buckets drawn as bars; longer series are drawn as stacked areas. */
const BAR_LIMIT = 72;

/** Fuel per bucket (stacked ME/AE bars) or per reading / dense buckets (stacked areas). */
export function SeriesChart({
  points,
  bucket,
}: {
  points: readonly FuelSeriesPointDto[];
  bucket: Bucket;
}) {
  const { t, i18n } = useTranslation('telemetry');
  const id = useId();
  const data = [...points];
  // Bars read well up to a few dozen buckets; denser series (hourly over a week) become areas.
  const bars = bucket !== 'raw' && data.length <= BAR_LIMIT;
  const axis = {
    x: (
      <XAxis
        dataKey="time"
        tickFormatter={(time: string) => formatDateTime(time, i18n.language, pattern(bucket, true))}
        tickLine={false}
        axisLine={false}
        minTickGap={28}
        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
      />
    ),
    y: (
      <YAxis
        tickLine={false}
        axisLine={false}
        width={48}
        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
      />
    ),
  };
  return (
    <figure aria-labelledby={`${id}-caption`} className="h-72 min-w-0">
      <figcaption id={`${id}-caption`} className="sr-only">
        {t('series.caption', { bucket: t(`buckets.${bucket}`) })}
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        {!bars ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
            {axis.x}
            {axis.y}
            <Tooltip
              content={(props) => (
                <ChartTooltip {...(props as TooltipContentProps<number, string>)} bucket={bucket} />
              )}
            />
            <Area
              type="monotone"
              dataKey="fuelMeTon"
              stackId="fuel"
              stroke={COLORS.me}
              fill={COLORS.me}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="fuelAeTon"
              stackId="fuel"
              stroke={COLORS.ae}
              fill={COLORS.ae}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            barCategoryGap="18%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
            {axis.x}
            {axis.y}
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={(props) => (
                <ChartTooltip {...(props as TooltipContentProps<number, string>)} bucket={bucket} />
              )}
            />
            <Bar
              dataKey="fuelMeTon"
              stackId="fuel"
              fill={COLORS.me}
              stroke="var(--surface)"
              strokeWidth={1}
              isAnimationActive={false}
            />
            <Bar
              dataKey="fuelAeTon"
              stackId="fuel"
              fill={COLORS.ae}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}

/** Legend of the series chart (colour + text label). */
export function SeriesLegend() {
  const { t } = useTranslation('telemetry');
  return (
    <ul className="flex flex-wrap gap-4 text-xs" aria-label={t('series.legend')}>
      {(
        [
          ['me', t('series.me')],
          ['ae', t('series.ae')],
        ] as const
      ).map(([key, label]) => (
        <li key={key} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2.5 rounded-sm" style={{ background: COLORS[key] }} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
