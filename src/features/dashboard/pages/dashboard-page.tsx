import {
  Activity,
  ArrowUpRight,
  BellRing,
  Leaf,
  Map as MapIcon,
  Radar,
  RefreshCw,
  ShieldAlert,
  Ship,
  Siren,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { getCiiControllerFleetSummaryQueryKey } from '@/shared/api/generated/emission/cii/cii';
import {
  getAlertsControllerListQueryKey,
  getAlertsControllerSummaryQueryKey,
} from '@/shared/api/generated/notification/alerts/alerts';
import { getVesselStatesControllerListQueryKey } from '@/shared/api/generated/safety/vessels/vessels';
import { getStatisticsControllerStatsQueryKey } from '@/shared/api/generated/surveillance/statistics/statistics';
import { usePermission } from '@/shared/auth/hooks';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useAlertStream, useCiiUpdates, useRealtimeConnection } from '@/shared/realtime';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import {
  FUEL_MAX_VESSELS,
  fuelOf,
  useAisStats,
  useAlertSummary,
  useAlertWindow,
  useEwsStates,
  useFleetCii,
  useFleetFuel,
  useRateHistory,
  useRecentAlerts,
  useSurveillance24h,
} from '../api/dashboard';
import { AlertsTimelineChart } from '../components/alerts-timeline-chart';
import { EmissionsCard } from '../components/emissions-card';
import { RateChart } from '../components/rate-chart';
import { RecentAlerts } from '../components/recent-alerts';
import { SurveillanceBreakdown } from '../components/surveillance-card';
import { useNow } from '@/shared/hooks/use-now';
import { alertTimeline, ewsCounts } from '../lib/dashboard';
import { currentYear } from '@/shared/lib/clock';

const FleetMap = lazy(() =>
  import('../components/fleet-map').then((module) => ({ default: module.FleetMap })),
);

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to}>
        {children} <ArrowUpRight />
      </Link>
    </Button>
  );
}

function Loading({ className = 'h-48' }: { className?: string }) {
  return <Skeleton className={cn('w-full', className)} />;
}

/**
 * Operations overview (landing page): AIS traffic, open alerts, pipeline EWS, surveillance of
 * the last 24 h, the fleet's CII and fuel, a live map and the newest alerts. Every card needs
 * its own permission (spec §8.4) and refreshes on a timer and from the realtime stream.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const queryClient = useQueryClient();
  const { connected, status } = useRealtimeConnection();
  const can = {
    ais: usePermission('ais:read'),
    alerts: usePermission('alert:read'),
    safety: usePermission('safety:read'),
    surveillance: usePermission('surveillance:read'),
    cii: usePermission('cii:read'),
  };
  const anchor = useNow(60_000);
  const year = currentYear();

  const stats = useAisStats(can.ais);
  const history = useRateHistory(stats.data, stats.dataUpdatedAt);
  const summary = useAlertSummary(can.alerts);
  const window7d = useAlertWindow(can.alerts, anchor);
  const recent = useRecentAlerts(can.alerts);
  const ews = useEwsStates(can.safety);
  const surveillance = useSurveillance24h(can.surveillance, anchor);
  const cii = useFleetCii(can.cii, year);
  const fuel = useFleetFuel(can.cii, cii.data?.items ?? [], year);

  const [newAlerts, setNewAlerts] = useState(0);
  useAlertStream((alert, kind) => {
    if (kind === 'raised') setNewAlerts((count) => count + 1);
    void queryClient.invalidateQueries({ queryKey: getAlertsControllerSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getAlertsControllerListQueryKey() });
    // The counters of the alert's domain follow at once instead of at their next refresh.
    if (alert.type === 'ews') {
      void queryClient.invalidateQueries({ queryKey: getVesselStatesControllerListQueryKey() });
    } else if (alert.domain === 'surveillance') {
      void queryClient.invalidateQueries({ queryKey: getStatisticsControllerStatsQueryKey() });
    }
  });
  useCiiUpdates(() => {
    void queryClient.invalidateQueries({ queryKey: getCiiControllerFleetSummaryQueryKey() });
  });

  const timeline = useMemo(
    () => alertTimeline(window7d.data?.data ?? [], anchor),
    [window7d.data, anchor],
  );
  const ewsCount = useMemo(() => ewsCounts(ews.data ?? []), [ews.data]);
  const fuelTotals = fuelOf(fuel.points, anchor);
  const lastUpdated = Math.max(stats.dataUpdatedAt, summary.dataUpdatedAt, ews.dataUpdatedAt);

  const refresh = () => {
    setNewAlerts(0);
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const [key] = query.queryKey;
        return (
          typeof key === 'string' &&
          [
            '/api/v2/ais/stats',
            '/api/v2/alerts',
            '/api/v2/safety',
            '/api/v2/surveillance',
            '/api/v2/cii',
          ].some((prefix) => key.startsWith(prefix))
        );
      },
    });
  };

  const severity = summary.data?.bySeverity;
  const noCards = !Object.values(can).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.fleet')}
        title={t('title')}
        description={t('description')}
        icon={Radar}
        actions={
          <>
            <span
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs',
                connected ? 'border-success/40 text-success' : 'text-muted-foreground',
              )}
              data-testid="dashboard-live"
            >
              <span className="relative flex size-2" aria-hidden>
                {connected && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                )}
                <span
                  className={cn(
                    'relative inline-flex size-2 rounded-full',
                    connected ? 'bg-success' : 'bg-muted-foreground',
                  )}
                />
              </span>
              {t(`live.${status}`)}
            </span>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw /> {t('refresh')}
            </Button>
            <Button asChild size="sm">
              <Link to="/map">
                <MapIcon /> {t('quickLinks.map')}
              </Link>
            </Button>
          </>
        }
      >
        {lastUpdated > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('updatedAt', { time: formatDateTime(lastUpdated, i18n.language, 'HH:mm:ss') })} ·{' '}
            {t('autoRefresh')}
          </p>
        )}
      </PageHeader>

      {noCards && (
        <div className="rounded-xl border bg-surface">
          <EmptyState icon={Ship} title={t('empty.title')} description={t('empty.description')} />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can.ais && (
          <StatCard
            label={t('stats.trackedVessels')}
            value={stats.data ? formatNumber(stats.data.activeVessels, i18n.language) : '—'}
            loading={stats.isPending}
            icon={Ship}
            tone="primary"
            description={
              stats.data
                ? t('stats.trackedHint', { minutes: stats.data.activeWindowMinutes })
                : stats.error
                  ? t('stats.unavailable')
                  : undefined
            }
            methodId="data.ais_ingest_rules"
          />
        )}
        {can.ais && (
          <StatCard
            label={t('stats.messages')}
            value={stats.data ? formatNumber(stats.data.messagesLastMinute, i18n.language) : '—'}
            unit={t('stats.perMinute')}
            loading={stats.isPending}
            icon={Activity}
            tone="default"
            description={
              stats.data
                ? t('stats.bySource', {
                    primary: formatNumber(
                      stats.data.bySource.primary.messagesLastMinute,
                      i18n.language,
                    ),
                    batam: formatNumber(
                      stats.data.bySource.batam.messagesLastMinute,
                      i18n.language,
                    ),
                    pusher: formatNumber(
                      stats.data.bySource.pusher.messagesLastMinute,
                      i18n.language,
                    ),
                  })
                : undefined
            }
          />
        )}
        {can.alerts && (
          <StatCard
            label={t('stats.openAlerts')}
            value={summary.data ? formatNumber(summary.data.total, i18n.language) : '—'}
            loading={summary.isPending}
            icon={BellRing}
            tone={severity && severity.critical > 0 ? 'danger' : 'warning'}
            description={
              severity ? (
                <span>{t('stats.openAlertsHint', { count: severity.critical })}</span>
              ) : summary.error ? (
                t('stats.unavailable')
              ) : undefined
            }
            methodId="notify.alert_dedup_merge"
            footer={
              severity ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="warning">
                    {t('stats.warningCount', { count: severity.warning })}
                  </Badge>
                  <Badge variant="info">{t('stats.infoCount', { count: severity.info })}</Badge>
                  {newAlerts > 0 && (
                    <Badge variant="primary" data-testid="new-alerts">
                      {t('stats.newAlerts', { count: newAlerts })}
                    </Badge>
                  )}
                </div>
              ) : undefined
            }
          />
        )}
        {can.safety && (
          <StatCard
            label={t('stats.ews')}
            value={ews.data ? formatNumber(ewsCount.danger, i18n.language) : '—'}
            unit={t('stats.ewsDangerUnit')}
            loading={ews.isPending}
            icon={Siren}
            tone={ewsCount.danger > 0 ? 'danger' : 'success'}
            methodId="ews.pipeline_distance_status"
            description={
              ews.data
                ? t('stats.ewsWarning', { count: ewsCount.warning })
                : ews.error
                  ? t('stats.unavailable')
                  : undefined
            }
            footer={
              ewsCount.dangerVessels.length > 0 ? (
                <p className="truncate text-[11px] text-danger">
                  {ewsCount.dangerVessels
                    .slice(0, 3)
                    .map((vessel) => vessel.name)
                    .join(' · ')}
                </p>
              ) : undefined
            }
          />
        )}
      </div>

      {(can.alerts || can.surveillance) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
          {can.alerts && (
            <Section
              className={cn('min-w-0', can.surveillance && 'xl:col-span-2')}
              title={t('alertsChart.title')}
              description={t('alertsChart.description')}
              actions={<CardLink to="/alerts">{t('quickLinks.alerts')}</CardLink>}
            >
              {window7d.isPending ? (
                <Loading className="h-72" />
              ) : window7d.error ? (
                <ErrorState
                  error={window7d.error}
                  onRetry={() => void window7d.refetch()}
                  size="sm"
                />
              ) : (
                <>
                  <AlertsTimelineChart rows={timeline} />
                  {window7d.data.page.nextCursor && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('alertsChart.truncated')}
                    </p>
                  )}
                </>
              )}
            </Section>
          )}
          {can.surveillance && (
            <Section
              className="min-w-0"
              title={t('surveillance.title')}
              description={t('surveillance.description')}
              actions={<CardLink to="/surveillance">{t('surveillance.open')}</CardLink>}
            >
              {surveillance.isPending ? (
                <Loading />
              ) : surveillance.error ? (
                <ErrorState
                  error={surveillance.error}
                  onRetry={() => void surveillance.refetch()}
                  size="sm"
                />
              ) : (
                <SurveillanceBreakdown stats={surveillance.data} />
              )}
            </Section>
          )}
        </div>
      )}

      {(can.ais || can.alerts) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
          {can.ais && (
            <Section
              className={cn('min-w-0', can.alerts && 'xl:col-span-2')}
              contentClassName="flex flex-1 flex-col"
              title={t('map.title')}
              description={t('map.description')}
              actions={<CardLink to="/map">{t('quickLinks.map')}</CardLink>}
            >
              <Suspense fallback={<Loading className="h-80 xl:h-full" />}>
                <FleetMap />
              </Suspense>
            </Section>
          )}
          {can.alerts && (
            <Section
              className="min-w-0"
              title={t('recent.title')}
              description={t('recent.description')}
              actions={<CardLink to="/alerts">{t('recent.all')}</CardLink>}
            >
              {recent.isPending ? (
                <Loading className="h-64" />
              ) : recent.error ? (
                <ErrorState error={recent.error} onRetry={() => void recent.refetch()} size="sm" />
              ) : (
                <RecentAlerts alerts={recent.data.data} />
              )}
            </Section>
          )}
        </div>
      )}

      {(can.cii || can.ais) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          {can.cii && (
            <Section
              className="min-w-0"
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Leaf className="size-4 text-success" aria-hidden />
                  {t('emissions.title', { year })} <MethodInfo methodId="cii.rating_grade" />
                </span>
              }
              description={t('emissions.description')}
              actions={<CardLink to="/cii">{t('quickLinks.cii')}</CardLink>}
            >
              {cii.isPending ? (
                <Loading className="h-72" />
              ) : cii.error ? (
                <ErrorState error={cii.error} onRetry={() => void cii.refetch()} size="sm" />
              ) : cii.data.vessels === 0 ? (
                <EmptyState
                  icon={Leaf}
                  size="sm"
                  title={t('emissions.empty')}
                  description={t('emissions.emptyHint')}
                />
              ) : (
                <EmissionsCard
                  summary={cii.data}
                  fuel={{
                    ...fuelTotals,
                    pending: fuel.pending,
                    vessels: fuel.vessels,
                    truncated:
                      cii.data.items.filter((item) => item.grade !== null).length >
                      FUEL_MAX_VESSELS,
                  }}
                />
              )}
            </Section>
          )}
          {can.ais && (
            <Section
              className="min-w-0"
              title={
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="size-4 text-primary" aria-hidden />
                  {t('rate.title')} <MethodInfo methodId="data.ais_ingest_rules" />
                </span>
              }
              description={t('rate.description')}
            >
              {stats.isPending ? (
                <Loading />
              ) : stats.error ? (
                <ErrorState error={stats.error} onRetry={() => void stats.refetch()} size="sm" />
              ) : (
                <RateChart stats={stats.data} history={history} />
              )}
            </Section>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {newAlerts > 0 ? t('stats.newAlerts', { count: newAlerts }) : ''}
      </p>
    </div>
  );
}
