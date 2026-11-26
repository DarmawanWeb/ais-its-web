import {
  ALERT_STATUS_LABELS,
  alertTypeLabel,
  type AlertStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { ArrowUpRight, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAlertsControllerList } from '@/shared/api/generated/notification/alerts/alerts';
import { SeverityBadge } from '@/shared/domain-ui/badges';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useAppLanguage } from '@/shared/i18n';

const STATUS_VARIANT: Record<AlertStatus, 'danger' | 'info' | 'muted'> = {
  open: 'danger',
  acknowledged: 'info',
  resolved: 'muted',
};

/** Alerts tab: the latest alerts of the vessel (as vessel or related vessel, `alert:read`). */
export function AlertsTab({ mmsi }: { mmsi: number }) {
  const { t, i18n } = useTranslation('vessels');
  const locale = useAppLanguage();
  const alerts = useAlertsControllerList({ mmsi, limit: 20 }, { query: { staleTime: 30_000 } });
  const items = alerts.data?.data ?? [];
  return (
    <Section
      title={t('alerts.title')}
      description={t('alerts.description')}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to={`/alerts?mmsi=${mmsi}&status=all`}>
            {t('alerts.inbox')} <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      {alerts.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : alerts.error ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} size="sm" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          size="sm"
          title={t('alerts.empty')}
          description={t('alerts.emptyHint')}
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((alert) => (
            <li key={alert.id}>
              <Link
                to={`/alerts?alert=${alert.id}&status=all`}
                className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex shrink-0 items-center gap-2 sm:w-60">
                  <SeverityBadge severity={alert.severity} />
                  <span className="truncate text-xs text-muted-foreground">
                    {alertTypeLabel(alert.type, locale)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{alert.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {alert.message}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span title={formatDateTime(alert.lastOccurredAt, i18n.language)}>
                    {formatRelativeTime(alert.lastOccurredAt, i18n.language)}
                  </span>
                  <Badge variant={STATUS_VARIANT[alert.status]}>
                    {ALERT_STATUS_LABELS[alert.status][locale]}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
