import { alertTypeLabel } from '@darmawanweb/ais-its-contracts/domain';
import { BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AlertDto } from '@/shared/api/generated/notification/model';
import { SeverityBadge } from '@/shared/domain-ui/badges';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';

import { useAppLanguage } from '@/shared/i18n';

/** The newest alerts, each opening the alert in the inbox. */
export function RecentAlerts({ alerts }: { alerts: readonly AlertDto[] }) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = useAppLanguage();
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        size="sm"
        title={t('recent.empty')}
        description={t('recent.emptyHint')}
      />
    );
  }
  return (
    <ul className="-mx-2 divide-y">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link
            to={`/alerts?alert=${alert.id}&status=all`}
            className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
          >
            <SeverityBadge severity={alert.severity} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{alert.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {alertTypeLabel(alert.type, locale)} ·{' '}
                <time
                  dateTime={alert.lastOccurredAt}
                  title={formatDateTime(alert.lastOccurredAt, i18n.language)}
                >
                  {formatRelativeTime(alert.lastOccurredAt, i18n.language)}
                </time>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
