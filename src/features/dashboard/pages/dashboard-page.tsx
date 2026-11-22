import { CII_GRADES } from '@darmawanweb/ais-its-contracts/domain';
import {
  ArrowUpRight,
  BellRing,
  BookOpenText,
  Fuel,
  Gauge,
  Leaf,
  Map as MapIcon,
  Radar,
  Ship,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useStatsControllerDescribe } from '@/shared/api/generated/ais-processor/ais/ais';
import {
  getAlertsControllerSummaryQueryKey,
  useAlertsControllerSummary,
} from '@/shared/api/generated/notification/alerts/alerts';
import { CiiGradeBadge } from '@/shared/domain-ui/badges';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatNumber } from '@/shared/lib/format';
import { useAlertStream, useRealtimeConnection } from '@/shared/realtime/hooks';
import { Button } from '@/shared/ui/button';

/**
 * Fleet dashboard (scaffold): vessels tracked by the AIS pipeline (GET /ais/stats) and open
 * alerts (GET /alerts/summary, refreshed by the alert stream); CII and fuel KPIs pending.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation('dashboard');
  const queryClient = useQueryClient();
  const { connected } = useRealtimeConnection();
  // Platform-wide count of vessels with a recent position (not the vessels of a map view).
  const aisStats = useStatsControllerDescribe({
    query: { refetchInterval: 30_000, staleTime: 15_000 },
  });
  const alertSummary = useAlertsControllerSummary({ query: { staleTime: 30_000 } });
  useAlertStream(() => {
    void queryClient.invalidateQueries({ queryKey: getAlertsControllerSummaryQueryKey() });
  });

  const links = [
    { to: '/map', label: t('quickLinks.map'), icon: MapIcon },
    { to: '/alerts', label: t('quickLinks.alerts'), icon: BellRing },
    { to: '/cii', label: t('quickLinks.cii'), icon: Leaf },
    { to: '/methodology', label: t('quickLinks.methodology'), icon: BookOpenText },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.fleet')}
        title={t('title')}
        description={t('description')}
        icon={Gauge}
        actions={
          <Button asChild>
            <Link to="/map">
              <Radar /> {t('quickLinks.map')}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('stats.trackedVessels')}
          value={aisStats.data ? formatNumber(aisStats.data.activeVessels, i18n.language) : '—'}
          loading={aisStats.isPending}
          icon={Ship}
          tone="primary"
          description={
            aisStats.data
              ? t('stats.trackedHint', { minutes: aisStats.data.activeWindowMinutes })
              : t('stats.unavailable')
          }
          footer={
            <span className="text-[11px] text-muted-foreground">
              <span className={connected ? 'text-success' : 'text-muted-foreground'}>●</span>{' '}
              {connected
                ? t('common:shell.realtime.connected')
                : t('common:shell.realtime.disconnected')}
            </span>
          }
        />
        <StatCard
          label={t('stats.openAlerts')}
          value={alertSummary.data ? formatNumber(alertSummary.data.total, i18n.language) : '—'}
          loading={alertSummary.isPending}
          icon={BellRing}
          tone="warning"
          description={
            alertSummary.data
              ? t('stats.openAlertsHint', { count: alertSummary.data.bySeverity.critical })
              : t('stats.unavailable')
          }
        />
        <StatCard
          label={t('stats.fleetCii')}
          value="—"
          icon={Leaf}
          tone="success"
          methodId="cii.rating_grade"
          description={t('stats.pending')}
        />
        <StatCard
          label={t('stats.fuel30d')}
          value="—"
          unit="t"
          icon={Fuel}
          description={t('stats.pending')}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title={
            <span className="inline-flex items-center gap-1.5">
              {t('ciiDistribution.title')} <MethodInfo methodId="cii.rating_grade" />
            </span>
          }
          description={t('ciiDistribution.description')}
        >
          <ul className="grid grid-cols-5 gap-3">
            {CII_GRADES.map((grade) => (
              <li
                key={grade}
                className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex h-28 w-full items-end justify-center rounded-md bg-background/60 p-1.5">
                  <div className="h-1 w-full rounded-sm bg-border" aria-hidden />
                </div>
                <CiiGradeBadge grade={grade} />
                <span className="font-mono text-sm text-muted-foreground tabular-nums">—</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t('quickLinks.title')}>
          <ul className="grid gap-2">
            {links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="group flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/8"
                >
                  <link.icon className="size-4 text-primary" aria-hidden />
                  {link.label}
                  <ArrowUpRight
                    className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title={t('activity.title')} description={t('activity.description')}>
        <EmptyState
          icon={Radar}
          title={t('activity.empty')}
          description={t('activity.emptyDescription')}
          size="sm"
        />
      </Section>
    </div>
  );
}
