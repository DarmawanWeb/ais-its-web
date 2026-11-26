import {
  alertTypeLabel,
  ALERT_SEVERITY_LABELS,
  isZoneKind,
  SURVEILLANCE_EVENT_STATUS_LABELS,
  ZONE_KIND_LABELS,
} from '@darmawanweb/ais-its-contracts/domain';
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  ClipboardList,
  Cpu,
  EyeOff,
  Fish,
  Layers,
  type LucideIcon,
  Radar,
  RefreshCw,
  ShieldAlert,
  Siren,
  Waves,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { SeverityBadge } from '@/shared/domain-ui/badges';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import {
  useDetectors,
  useStatsSeries,
  useSurveillanceEvents,
  useSurveillanceStats,
} from '../api/queries';
import { EventDetailSheet } from '../components/event-detail-sheet';
import { ExportCsvButton } from '../components/export-button';
import { MethodChips } from '@/shared/domain-ui/method-chips';
import { BreakdownBars, TypeTrendChart } from '../components/overview-charts';
import { SurveillanceNav } from '../components/surveillance-nav';
import { configValueText } from '../hooks/use-detector';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { SurveillanceEvent } from '../lib/dto';
import { exportFileName, toCsvRows } from '../lib/export';
import { RANGE_PRESETS, type RangePreset, rangeStart } from '../lib/filters';
import { buildSeries, type SeriesRow } from '../lib/series';
import { buildBuckets, isDailyBucket } from '../lib/time-buckets';
import { useEventText } from '../hooks/use-event-text';
import {
  isSurveillanceType,
  SURVEILLANCE_TYPES,
  TYPE_COLOR,
  TYPE_METHOD,
  TYPE_PATH,
  type SurveillanceType,
} from '../lib/types';

const TYPE_ICON: Record<SurveillanceType, LucideIcon> = {
  transhipment: ArrowLeftRight,
  fishing: Fish,
  dark: EyeOff,
  anomaly: Activity,
  geofence: ShieldAlert,
};

const SEVERITY_BAR: Record<string, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};
const STATUS_BAR: Record<string, string> = {
  open: 'bg-info',
  confirmed: 'bg-danger',
  dismissed: 'bg-muted-foreground',
  resolved: 'bg-success',
};

function isRange(value: string | null): value is RangePreset {
  return value !== null && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** Key thresholds of a detector shown on its card (`GET /surveillance/detectors` → config). */
type ConfigUnit = 'min' | 'kn' | 'km' | 'm' | '%';

const KEY_CONFIG: Record<string, { key: string; unit?: ConfigUnit }[]> = {
  transhipment: [
    { key: 'ACCURACY_THRESHOLD', unit: '%' },
    { key: 'NEIGHBOUR_RADIUS_M', unit: 'm' },
  ],
  dark: [
    { key: 'GAP_MIN', unit: 'min' },
    { key: 'HARBOUR_DISTANCE_KM', unit: 'km' },
  ],
  anomaly: [{ key: 'MIN_POSITIONS' }],
  fishing: [
    { key: 'MIN_DURATION_MIN', unit: 'min' },
    { key: 'MAX_SOG_KN', unit: 'kn' },
  ],
  geofence: [{ key: 'KINDS' }],
};

/**
 * Surveillance overview (`/surveillance`): counts of the selected period, events per type over
 * time, severity and review breakdowns, the detectors with their methods and thresholds, the
 * candidate queue for authority users and the latest events.
 */
export function OverviewPage() {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  useSurveillanceLive();
  const [search, setSearch] = useSearchParams();
  const rangeParam = search.get('range');
  const range: RangePreset = isRange(rangeParam) ? rangeParam : '7d';
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = rangeStart(range, anchor);
  const to = useMemo(() => new Date(Math.floor(anchor / 60_000) * 60_000).toISOString(), [anchor]);
  const buckets = useMemo(() => buildBuckets(new Date(from), new Date(to), 12), [from, to]);

  const stats = useSurveillanceStats({ from, to });
  const series = useStatsSeries(buckets);
  const rows = useMemo(
    () =>
      buildSeries(
        buckets,
        series.map((query) => query.data),
      ),
    [buckets, series],
  );
  const detectors = useDetectors();
  const recent = useSurveillanceEvents({ from, limit: 8 });
  const [selected, setSelected] = useState<SurveillanceEvent | null>(null);
  const eventText = useEventText();
  const n = (value: number | undefined) =>
    value === undefined ? '—' : formatNumber(value, i18n.language);

  const setRange = (value: RangePreset) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '7d') next.delete('range');
        else next.set('range', value);
        return next;
      },
      { replace: true },
    );
    setAnchor(Date.now());
  };

  const data = stats.data;
  const daily = buckets[0] ? isDailyBucket(buckets[0]) : true;
  /** A detector threshold for its card: numbers with units, zone kinds by their labels. */
  const configText = (value: unknown, unit: ConfigUnit | undefined): string => {
    const number = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isNaN(number)) {
      if (unit === 'min') return t('duration.minutes', { count: number });
      return `${formatNumber(number, i18n.language, { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
    }
    const items = Array.isArray(value) ? value : String(configValueText(value)).split(',');
    return items
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => (isZoneKind(item) ? ZONE_KIND_LABELS[item][locale] : item))
      .join(', ');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.surveillance')}
        title={t('overview.title')}
        description={t('overview.description')}
        icon={Radar}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={range}
              onValueChange={(value) => value && setRange(value as RangePreset)}
              aria-label={t('filters.range')}
            >
              {RANGE_PRESETS.map((preset) => (
                <ToggleGroupItem key={preset} value={preset} className="h-7 px-3">
                  {t(`filters.ranges.${preset}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setAnchor(Date.now())}
              aria-label={t('common:actions.refresh')}
            >
              <RefreshCw />
            </Button>
            <ExportCsvButton
              fileName={exportFileName(`surveillance-trend-${range}`)}
              disabled={!rows.some((row) => row.loaded)}
              collect={() =>
                Promise.resolve({
                  truncated: false,
                  rows: toCsvRows(
                    rows.filter((row) => row.loaded),
                    [
                      { header: t('csv.from'), value: (row) => row.from },
                      { header: t('csv.to'), value: (row) => row.to },
                      ...SURVEILLANCE_TYPES.map((type) => ({
                        header: alertTypeLabel(type, locale),
                        value: (row: SeriesRow) => row[type],
                      })),
                      { header: t('csv.total'), value: (row) => row.total },
                    ],
                  ),
                })
              }
            />
          </div>
        }
      />
      <SurveillanceNav />

      {stats.isError ? (
        <Section>
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        </Section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('overview.stats.total')}
            value={n(data?.total)}
            loading={stats.isPending}
            icon={Layers}
            tone="primary"
            description={t('overview.stats.totalHint', { range: t(`filters.ranges.${range}`) })}
          />
          <StatCard
            label={t('overview.stats.active')}
            value={n(data?.active)}
            loading={stats.isPending}
            icon={Siren}
            tone="warning"
            description={t('overview.stats.activeHint')}
          />
          <StatCard
            label={t('overview.stats.toReview')}
            value={n(data?.byStatus.open)}
            loading={stats.isPending}
            icon={ClipboardList}
            tone="default"
            description={t('overview.stats.toReviewHint')}
          />
          <StatCard
            label={t('overview.stats.critical')}
            value={n(data?.bySeverity.critical)}
            loading={stats.isPending}
            icon={ShieldAlert}
            tone="danger"
            description={t('overview.stats.criticalHint')}
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          className="min-w-0 xl:col-span-2"
          title={t('overview.trendTitle')}
          description={t('overview.trendDescription', { count: buckets.length })}
        >
          {series.every((query) => query.isError) && series.length > 0 ? (
            <ErrorState
              error={series[0]?.error}
              onRetry={() => series.forEach((query) => void query.refetch())}
              size="sm"
            />
          ) : (
            <TypeTrendChart
              rows={rows}
              loading={series.some((query) => query.isPending)}
              daily={daily}
            />
          )}
        </Section>
        <Section
          title={t('overview.breakdownTitle')}
          description={t('overview.breakdownDescription')}
        >
          {stats.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : data ? (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('fields.severity')}
                </h3>
                <BreakdownBars
                  total={data.total}
                  items={(['critical', 'warning', 'info'] as const).map((key) => ({
                    key,
                    label: ALERT_SEVERITY_LABELS[key][locale],
                    value: data.bySeverity[key] ?? 0,
                    className: SEVERITY_BAR[key] ?? 'bg-primary',
                  }))}
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('fields.status')}
                </h3>
                <BreakdownBars
                  total={data.total}
                  items={(['open', 'confirmed', 'dismissed', 'resolved'] as const).map((key) => ({
                    key,
                    label: SURVEILLANCE_EVENT_STATUS_LABELS[key][locale],
                    value: data.byStatus[key] ?? 0,
                    className: STATUS_BAR[key] ?? 'bg-primary',
                  }))}
                />
              </div>
            </div>
          ) : null}
        </Section>
      </div>

      <Section title={t('overview.typesTitle')} description={t('overview.typesDescription')}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {SURVEILLANCE_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            const path = TYPE_PATH[type];
            const max = Math.max(1, ...rows.map((row) => row[type]));
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="flex size-7 items-center justify-center rounded-md bg-muted"
                      aria-hidden
                    >
                      <Icon className="size-4" style={{ color: TYPE_COLOR[type] }} />
                    </span>
                    {alertTypeLabel(type, locale)}
                  </span>
                  {path && (
                    <ArrowUpRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  )}
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                  {n(data?.byType[type] ?? (data ? 0 : undefined))}
                </p>
                <div className="mt-2 flex h-8 items-end gap-0.5" aria-hidden>
                  {rows.map((row) => (
                    <span
                      key={row.from}
                      className="flex-1 rounded-t-[2px]"
                      style={{
                        height: `${Math.max(6, (row[type] / max) * 100)}%`,
                        background: row[type] > 0 ? TYPE_COLOR[type] : 'var(--muted)',
                      }}
                    />
                  ))}
                </div>
              </>
            );
            return (
              <li key={type} className="relative">
                {path ? (
                  <Link
                    to={path}
                    className="group block rounded-xl border bg-muted/20 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-xl border bg-muted/20 p-3">{body}</div>
                )}
                <span className="absolute top-3 right-9">
                  <MethodInfo methodId={TYPE_METHOD[type]} />
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          className="min-w-0 xl:col-span-2"
          title={t('overview.recentTitle')}
          description={t('overview.recentDescription')}
        >
          {recent.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : recent.isError ? (
            <ErrorState error={recent.error} onRetry={() => void recent.refetch()} size="sm" />
          ) : recent.data.data.length === 0 ? (
            <EmptyState
              icon={Waves}
              title={t('overview.recentEmpty')}
              description={t('overview.recentEmptyHint')}
              size="sm"
            />
          ) : (
            <ul className="divide-y">
              {recent.data.data.map((event) => {
                const Icon = isSurveillanceType(event.type) ? TYPE_ICON[event.type] : Radar;
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(event)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"
                        aria-hidden
                      >
                        <Icon
                          className="size-4"
                          style={{
                            color: isSurveillanceType(event.type)
                              ? TYPE_COLOR[event.type]
                              : undefined,
                          }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {eventText.title(event)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {event.vesselName ?? event.mmsi} ·{' '}
                          {formatRelativeTime(event.time, i18n.language)}
                        </span>
                      </span>
                      <SeverityBadge severity={event.currentSeverity} className="shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title={t('overview.detectorsTitle')}
            description={t('overview.detectorsDescription')}
          >
            {detectors.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : detectors.isError ? (
              <ErrorState
                error={detectors.error}
                onRetry={() => void detectors.refetch()}
                size="sm"
              />
            ) : (
              <ul className="space-y-2">
                {detectors.data.map((detector) => (
                  <li key={detector.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Cpu className="size-4 text-muted-foreground" aria-hidden />
                        {isSurveillanceType(detector.id)
                          ? alertTypeLabel(detector.id, locale)
                          : detector.id}
                      </span>
                      <Badge variant={detector.enabled ? 'success' : 'muted'}>
                        {detector.enabled ? t('overview.enabled') : t('overview.disabled')}
                      </Badge>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-1.5">
                      {(KEY_CONFIG[detector.id] ?? []).map(({ key, unit }) => {
                        const value = detector.config?.[key];
                        if (value === undefined || value === null) return null;
                        return (
                          <div
                            key={key}
                            className="inline-flex items-baseline gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]"
                          >
                            <dt className="text-muted-foreground">{t(`overview.config.${key}`)}</dt>
                            <dd className="font-mono font-medium tabular-nums">
                              {configText(value, unit)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    <MethodChips methodIds={detector.methodIds} limit={2} className="mt-2" />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {data?.transhipmentQueue && (
            <Section
              title={
                <span className="inline-flex items-center gap-1.5">
                  {t('overview.queueTitle')} <MethodInfo methodId="transhipment.candidate_queue" />
                </span>
              }
              description={t('overview.queueDescription')}
            >
              <dl className="grid grid-cols-2 gap-3">
                {(['pending', 'inProgress', 'completed', 'failed'] as const).map((key) => (
                  <div key={key} className="rounded-lg border bg-muted/20 p-3">
                    <dt className="text-xs text-muted-foreground">{t(`overview.queue.${key}`)}</dt>
                    <dd
                      className={cn(
                        'font-mono text-xl font-semibold tabular-nums',
                        key === 'failed' &&
                          (data.transhipmentQueue?.failed ?? 0) > 0 &&
                          'text-danger',
                      )}
                    >
                      {n(data.transhipmentQueue?.[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
          {data && (
            <p className="text-xs text-muted-foreground">
              {t('overview.violationsNote', { count: data.fishingViolations })}{' '}
              <Link
                to="/surveillance/fishing?tab=history"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                {t('overview.violationsLink')}
              </Link>
            </p>
          )}
        </div>
      </div>

      <EventDetailSheet
        event={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
