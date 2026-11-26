import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CollisionRiskBadge } from '@/shared/domain-ui/badges';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatDateTime, formatNumber } from '@/shared/lib/format';

import { bandTicks, type EncounterChartPoint } from '../lib/encounters';
import type { CollisionThresholds } from '../lib/thresholds';

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

function useFormatters() {
  const { i18n } = useTranslation();
  return {
    time: (value: number) => formatDateTime(value, i18n.language, 'HH:mm'),
    fullTime: (value: number) => formatDateTime(value, i18n.language, 'dd MMM yyyy HH:mm:ss'),
    number: (value: number | null | undefined, digits = 2) =>
      formatNumber(value, i18n.language, { maximumFractionDigits: digits }),
  };
}

function SampleTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const { t } = useTranslation('safety');
  const format = useFormatters();
  const point = payload?.[0]?.payload as EncounterChartPoint | undefined;
  if (!active || !point) return null;
  const risk = ['none', 'low', 'medium', 'high'].includes(point.risk)
    ? (point.risk as 'none' | 'low' | 'medium' | 'high')
    : null;
  return (
    <div className="rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1 font-medium">{format.fullTime(point.time)}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">CPA</dt>
        <dd className="font-mono tabular-nums">{format.number(point.cpaNm)} nm</dd>
        <dt className="text-muted-foreground">TCPA</dt>
        <dd className="font-mono tabular-nums">
          {point.tcpaMin === null
            ? '—'
            : `${format.number(point.tcpaMin, 1)} ${t('common:domain.units.minutes')}`}
        </dd>
        <dt className="text-muted-foreground">{t('collision.detail.range')}</dt>
        <dd className="font-mono tabular-nums">{format.number(point.rangeNm)} nm</dd>
      </dl>
      {risk && (
        <div className="mt-1.5">
          <CollisionRiskBadge risk={risk} />
        </div>
      )}
    </div>
  );
}

/**
 * CPA and TCPA history of an encounter as two synced single-series charts sharing the time
 * axis (no dual axis): CPA over the shaded risk bands, TCPA with the band time limits.
 */
export function EncounterChart({
  data,
  thresholds,
}: {
  data: readonly EncounterChartPoint[];
  thresholds: CollisionThresholds;
}) {
  const { t } = useTranslation('safety');
  const format = useFormatters();
  const maxCpa =
    Math.ceil(Math.max(thresholds.low.cpaNm * 1.2, ...data.map((p) => p.cpaNm)) * 1.05 * 4) / 4;
  const tcpaValues = data.flatMap((p) => (p.tcpaMin === null ? [] : [p.tcpaMin]));
  const maxTcpa = Math.ceil((Math.max(thresholds.low.tcpaMin * 1.1, ...tcpaValues) * 1.05) / 5) * 5;
  const minTcpa = Math.floor(Math.min(0, ...tcpaValues) / 5) * 5;
  const cpaTicks = bandTicks(
    [thresholds.high.cpaNm, thresholds.medium.cpaNm, thresholds.low.cpaNm],
    0,
    maxCpa,
  );
  const tcpaTicks = bandTicks(
    [0, thresholds.high.tcpaMin, thresholds.medium.tcpaMin, thresholds.low.tcpaMin],
    minTcpa,
    maxTcpa,
  );
  const rows = data as EncounterChartPoint[];

  const xAxis = (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tickFormatter={format.time}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={{ stroke: 'var(--border)' }}
      minTickGap={32}
    />
  );

  return (
    <div className="space-y-4" data-testid="encounter-chart">
      <figure className="space-y-1">
        <figcaption className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {t('collision.chart.cpaTitle')}
          <MethodInfo methodId="collision.cpa_tcpa" />
        </figcaption>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              syncId="encounter"
              margin={{ top: 8, right: 56, bottom: 0, left: -8 }}
            >
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
              <ReferenceArea
                y1={0}
                y2={thresholds.high.cpaNm}
                fill="var(--danger)"
                fillOpacity={0.12}
                ifOverflow="hidden"
                label={{
                  value: t('collision.bands.high'),
                  position: 'right',
                  fill: 'var(--muted-foreground)',
                  fontSize: 10,
                }}
              />
              <ReferenceArea
                y1={thresholds.high.cpaNm}
                y2={thresholds.medium.cpaNm}
                fill="var(--warning)"
                fillOpacity={0.1}
                ifOverflow="hidden"
                label={{
                  value: t('collision.bands.medium'),
                  position: 'right',
                  fill: 'var(--muted-foreground)',
                  fontSize: 10,
                }}
              />
              <ReferenceArea
                y1={thresholds.medium.cpaNm}
                y2={thresholds.low.cpaNm}
                fill="var(--info)"
                fillOpacity={0.08}
                ifOverflow="hidden"
                label={{
                  value: t('collision.bands.low'),
                  position: 'right',
                  fill: 'var(--muted-foreground)',
                  fontSize: 10,
                }}
              />
              {xAxis}
              <YAxis
                domain={[0, maxCpa]}
                ticks={cpaTicks}
                interval={0}
                tickFormatter={(value: number) => format.number(value)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => (
                  <SampleTooltip active={active} payload={payload} />
                )}
                cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              />
              <Line
                type="monotone"
                dataKey="cpaNm"
                name="CPA"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="space-y-1">
        <figcaption className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {t('collision.chart.tcpaTitle')}
          <MethodInfo methodId="collision.cpa_tcpa" />
        </figcaption>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              syncId="encounter"
              margin={{ top: 8, right: 56, bottom: 0, left: -8 }}
            >
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
              {(['high', 'medium', 'low'] as const).map((band) => (
                <ReferenceLine
                  key={band}
                  y={thresholds[band].tcpaMin}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                  ifOverflow="hidden"
                  label={{
                    value: t(`collision.bands.${band}`),
                    position: 'right',
                    fill: 'var(--muted-foreground)',
                    fontSize: 10,
                  }}
                />
              ))}
              {xAxis}
              <YAxis
                domain={[minTcpa, maxTcpa]}
                ticks={tcpaTicks}
                interval={0}
                tickFormatter={(value: number) => format.number(value, 0)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => (
                  <SampleTooltip active={active} payload={payload} />
                )}
                cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              />
              <Line
                type="monotone"
                dataKey="tcpaMin"
                name="TCPA"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
