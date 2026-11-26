import { Activity, ArrowUpRight, Gauge } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  useReadingsControllerSeries,
  useReadingsControllerStatus,
  useReadingsControllerSummary,
} from '@/shared/api/generated/telemetry/readings/readings';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { nowMs } from '@/shared/lib/clock';
import { LatestReadings } from './latest-readings';

const DAY = 86_400_000;

/** Telemetry tab: status, 30-day totals and daily sums of the fuel readings (`telemetry:read`). */
export function TelemetryTab({ mmsi }: { mmsi: number }) {
  const { t, i18n } = useTranslation('vessels');
  const id = useId();
  const range = useMemo(() => {
    const to = Math.ceil(nowMs() / 3_600_000) * 3_600_000;
    return { from: new Date(to - 30 * DAY).toISOString(), to: new Date(to).toISOString() };
  }, []);
  const status = useReadingsControllerStatus(String(mmsi), { query: { refetchInterval: 60_000 } });
  const summary = useReadingsControllerSummary(String(mmsi), range);
  const series = useReadingsControllerSeries(String(mmsi), { ...range, bucket: '1d', limit: 60 });
  const n = (value: number | null | undefined, digits = 2) =>
    formatNumber(value ?? null, i18n.language, { maximumFractionDigits: digits });

  if (status.error)
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  const points = series.data?.data ?? [];
  const empty = summary.data?.readings === 0 && !status.data?.lastReadingAt;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('telemetry.status')}
          loading={status.isPending}
          icon={Activity}
          tone={status.data?.active ? 'success' : 'default'}
          methodId="fuel.method_selection"
          value={
            <Badge
              variant={status.data?.active ? 'success' : 'muted'}
              className="font-sans text-sm"
            >
              {status.data?.active ? t('telemetry.active') : t('telemetry.inactive')}
            </Badge>
          }
          description={
            status.data?.lastReadingAt
              ? t('telemetry.lastReading', {
                  time: formatRelativeTime(status.data.lastReadingAt, i18n.language),
                })
              : t('telemetry.noReading')
          }
        />
        <StatCard
          label={t('telemetry.total30d')}
          loading={summary.isPending}
          icon={Gauge}
          tone="primary"
          methodId="telemetry.fuel_reading_usage"
          value={n(summary.data?.totalFuelTon)}
          unit="t"
          description={t('telemetry.readings', { count: summary.data?.readings ?? 0 })}
        />
        <StatCard
          label={t('telemetry.me30d')}
          loading={summary.isPending}
          value={n(summary.data?.fuelMeTon)}
          unit="t"
        />
        <StatCard
          label={t('telemetry.ae30d')}
          loading={summary.isPending}
          value={n(summary.data?.fuelAeTon)}
          unit="t"
        />
      </div>
      <Section
        title={t('telemetry.dailyTitle')}
        description={t('telemetry.dailyDescription', {
          minutes: status.data?.activeWindowMin ?? 10,
        })}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to={`/telemetry?mmsi=${mmsi}`}>
              {t('telemetry.explore')} <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        {series.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : empty || points.length === 0 ? (
          <EmptyState
            icon={Gauge}
            size="sm"
            title={t('telemetry.empty')}
            description={t('telemetry.emptyHint')}
          />
        ) : (
          <figure aria-labelledby={`${id}-caption`} className="h-56 min-w-0">
            <figcaption id={`${id}-caption`} className="sr-only">
              {t('telemetry.dailyTitle')}
            </figcaption>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(time: string) => formatDateTime(time, i18n.language, 'dd MMM')}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  contentStyle={{
                    background: 'var(--elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(time) =>
                    typeof time === 'string'
                      ? formatDateTime(time, i18n.language, 'dd MMM yyyy')
                      : ''
                  }
                  formatter={(value, name) => [
                    `${n(Number(value), 3)} t`,
                    name === 'fuelMeTon' ? t('telemetry.me') : t('telemetry.ae'),
                  ]}
                />
                <Bar
                  dataKey="fuelMeTon"
                  stackId="fuel"
                  fill="var(--chart-1)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="fuelAeTon"
                  stackId="fuel"
                  fill="var(--chart-3)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        )}
        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          {t('telemetry.methodNote')} <MethodInfo methodId="telemetry.fuel_reading_usage" />
        </p>
      </Section>
      {status.data && (
        <LatestReadings mmsi={mmsi} lastReadingAt={status.data.lastReadingAt ?? null} />
      )}
    </div>
  );
}
