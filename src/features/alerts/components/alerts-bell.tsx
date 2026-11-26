import {
  ALERT_STATUS_LABELS,
  alertTypeLabel,
  type AlertStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import {
  getAlertsControllerListQueryKey,
  getAlertsControllerSummaryQueryKey,
  useAlertsControllerList,
  useAlertsControllerSummary,
} from '@/shared/api/generated/notification/alerts/alerts';
import { usePermission } from '@/shared/auth/hooks';
import { formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useAlertStream } from '@/shared/realtime/hooks';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

import { useAppLanguage } from '@/shared/i18n';
import { badgeCount } from '../lib/format';
import { AlertTypeLabel, SeverityDot } from './alert-badges';

const LATEST_PARAMS = { limit: 6 } as const;

/**
 * Top bar alert bell (shell slot `topbar.alerts`): open alerts of the user's scope (spec §8.5,
 * `GET /alerts/summary`), a popover with the latest alerts, and the realtime listener that
 * raises a toast for new or escalated critical alerts on every page. Kept light: one small
 * query, the list only while the popover is open.
 */
export function AlertsBell() {
  const { t, i18n } = useTranslation('alerts');
  const locale = useAppLanguage();
  const canRead = usePermission('alert:read');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const severities = useRef(new Map<string, string>());

  const summary = useAlertsControllerSummary({
    query: { enabled: canRead, staleTime: 30_000, refetchInterval: 60_000 },
  });
  const latest = useAlertsControllerList(LATEST_PARAMS, {
    query: { enabled: canRead && open, staleTime: 15_000 },
  });

  useAlertStream((alert, kind) => {
    void queryClient.invalidateQueries({ queryKey: getAlertsControllerSummaryQueryKey() });
    void queryClient.invalidateQueries({
      queryKey: getAlertsControllerListQueryKey(LATEST_PARAMS),
      exact: true,
    });
    const before = severities.current.get(alert.id);
    severities.current.set(alert.id, alert.severity);
    if (severities.current.size > 500) {
      const oldest = severities.current.keys().next().value;
      if (oldest) severities.current.delete(oldest);
    }
    const escalated = kind === 'updated' && before !== undefined && before !== 'critical';
    if (alert.severity !== 'critical' || alert.status !== 'open') return;
    if (kind !== 'raised' && !escalated) return;
    toast.error(alert.title, {
      id: `alert-${alert.id}`,
      description: `${alertTypeLabel(alert.type, locale)} · MMSI ${alert.mmsi} — ${alert.message}`,
      duration: 12_000,
      action: {
        label: t('bell.view'),
        onClick: () => void navigate(`/alerts?alert=${encodeURIComponent(alert.id)}&status=all`),
      },
    });
  });

  const openCount = summary.data?.total ?? 0;
  const critical = summary.data?.bySeverity.critical ?? 0;
  const warning = summary.data?.bySeverity.warning ?? 0;
  const label = openCount > 0 ? t('bell.labelCount', { count: openCount }) : t('bell.label');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-testid="alerts-bell"
          className="relative"
        >
          {openCount > 0 ? <BellRing /> : <Bell />}
          {openCount > 0 && (
            <span
              aria-hidden
              data-testid="alerts-bell-count"
              className={cn(
                'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none font-bold text-white ring-2 ring-background',
                critical > 0 ? 'bg-danger' : 'bg-warning text-warning-foreground',
              )}
            >
              {badgeCount(openCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t('bell.title')}</p>
            <p className="text-xs text-muted-foreground">
              {summary.isError
                ? t('bell.summaryUnavailable')
                : t('bell.openSummary', { count: openCount })}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-1.5 py-0.5 text-danger">
              <SeverityDot severity="critical" /> {critical}
              <span className="sr-only">{t('bell.critical')}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-warning">
              <SeverityDot severity="warning" /> {warning}
              <span className="sr-only">{t('bell.warning')}</span>
            </span>
          </div>
        </div>
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {latest.isPending ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : latest.isError ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('bell.listUnavailable')}
            </p>
          ) : latest.data.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BellRing className="size-4" aria-hidden />
              </span>
              <p className="text-sm font-medium">{t('bell.empty')}</p>
              <p className="text-xs text-muted-foreground">{t('bell.emptyHint')}</p>
            </div>
          ) : (
            <ul className="divide-y" aria-label={t('bell.latest')}>
              {latest.data.data.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={`/alerts?alert=${encodeURIComponent(alert.id)}&status=all`}
                    onClick={() => setOpen(false)}
                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <SeverityDot severity={alert.severity} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium">{alert.title}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <AlertTypeLabel
                          type={alert.type}
                          domain={alert.domain}
                          className="min-w-0 flex-1"
                        />
                        <time
                          dateTime={alert.lastOccurredAt}
                          className="shrink-0 whitespace-nowrap"
                        >
                          {formatRelativeTime(alert.lastOccurredAt, i18n.language)}
                        </time>
                      </span>
                      {alert.status !== 'open' && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {alert.status in ALERT_STATUS_LABELS
                            ? ALERT_STATUS_LABELS[alert.status as AlertStatus][locale]
                            : alert.status}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to="/alerts" onClick={() => setOpen(false)}>
              {t('common:shell.alerts.viewAll')}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
