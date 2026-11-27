import { AIS_SOURCES } from '@darmawanweb/ais-its-contracts/domain';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { AisStatsDto } from '@/shared/api/generated/ais-processor/model';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui/skeleton';

import type { RateSample } from '../lib/dashboard';

const COLORS = {
  primary: 'var(--chart-1)',
  batam: 'var(--chart-2)',
  pusher: 'var(--chart-4)',
} as const;

/** Messages per minute by AIS source: current split and the last hours (`GET /ais/stats/series`). */
export function RateChart({
  stats,
  history,
  pending = false,
}: {
  stats: AisStatsDto;
  history: readonly RateSample[];
  pending?: boolean;
}) {
  const { t, i18n } = useTranslation('dashboard');
  const id = useId();
  const total = Math.max(stats.messagesLastMinute, 1);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ul className="grid gap-2.5">
        {AIS_SOURCES.map((source) => {
          const feed = stats.bySource[source];
          const share = feed.messagesLastMinute / total;
          return (
            <li key={source} className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: COLORS[source] }}
                    aria-hidden
                  />
                  {t(`sources.${source}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono text-sm font-medium text-foreground tabular-nums">
                    {formatNumber(feed.messagesLastMinute, i18n.language)}
                  </span>{' '}
                  {t('rate.perMinute')} · {t('rate.vessels', { count: feed.activeVessels })}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share * 100}%`, background: COLORS[source] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {history.length >= 2 ? (
        <figure aria-labelledby={`${id}-caption`} className="h-40 min-w-0">
          <figcaption id={`${id}-caption`} className="sr-only">
            {t('rate.caption')}
          </figcaption>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[...history]} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="at"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(at: number) => formatDateTime(at, i18n.language, 'HH:mm')}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
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
                contentStyle={{
                  background: 'var(--elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(at) =>
                  typeof at === 'number' ? formatDateTime(at, i18n.language, 'HH:mm') : ''
                }
                formatter={(value, name) => [
                  formatNumber(Number(value), i18n.language),
                  t(`sources.${String(name)}`),
                ]}
              />
              {AIS_SOURCES.map((source) => (
                <Area
                  key={source}
                  type="monotone"
                  dataKey={source}
                  stackId="rate"
                  stroke={COLORS[source]}
                  fill={COLORS[source]}
                  fillOpacity={0.3}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </figure>
      ) : pending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t('rate.collecting')}
        </p>
      )}
    </div>
  );
}
