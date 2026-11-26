import {
  ArrowUpRight,
  BellRing,
  CheckCheck,
  Eye,
  Mail,
  MapPin,
  MessageCircle,
  Repeat,
  Send,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAlertsControllerGet } from '@/shared/api/generated/notification/alerts/alerts';
import type { AlertDto, DeliveryDto } from '@/shared/api/generated/notification/model';
import { useNotificationsControllerDeliveries } from '@/shared/api/generated/notification/notifications/notifications';
import { Can } from '@/shared/auth/guards';
import { useSession } from '@/shared/auth/hooks';
import { CollisionRiskBadge, EwsStatusBadge, SeverityBadge } from '@/shared/domain-ui/badges';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { CoordinateText, MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useMethodCatalog } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

import { findCachedAlert } from '../lib/alert-cache';
import { shortId } from '../lib/format';
import { dataEntries, type DataEntry } from '../lib/alert-data';
import { localizeProblem } from '@/shared/api/problem-copy';
import { alertProblemCopies } from '../lib/problems';
import { AlertActions } from './alert-actions';
import { AlertStatusBadge, AlertTypeLabel } from './alert-badges';

const AlertMiniMap = lazy(() =>
  import('./alert-mini-map').then((module) => ({ default: module.AlertMiniMap })),
);

function useWho() {
  const { t } = useTranslation('alerts');
  const { userId } = useSession();
  return (id: string | null) => (!id ? null : id === userId ? t('detail.you') : shortId(id));
}

function DataValue({ entry }: { entry: DataEntry }) {
  const { t, i18n } = useTranslation('alerts');
  const value = entry.value;
  switch (entry.kind) {
    case 'meters':
      return <UnitValue value={value as number} unit="m" />;
    case 'nauticalMiles':
      return <UnitValue value={value as number} unit="nm" />;
    case 'minutes':
      return <UnitValue value={value as number} unit="minutes" digits={1} />;
    case 'knots':
      return <UnitValue value={value as number} unit="knots" />;
    case 'ewsStatus':
      return value === 0 || value === 1 || value === 3 ? (
        <EwsStatusBadge status={value} />
      ) : (
        <span>{String(value)}</span>
      );
    case 'collisionRisk':
      return ['none', 'low', 'medium', 'high'].includes(String(value)) ? (
        <CollisionRiskBadge risk={value as 'none' | 'low' | 'medium' | 'high'} />
      ) : (
        <span>{String(value)}</span>
      );
    case 'mmsi':
      return <MmsiText mmsi={value as number} copyable />;
    case 'time':
      return <span>{formatDateTime(value as string, i18n.language, 'dd MMM yyyy HH:mm:ss')}</span>;
    case 'number':
      return (
        <span className="font-mono tabular-nums">
          {formatNumber(value as number, i18n.language, { maximumFractionDigits: 4 })}
        </span>
      );
    case 'boolean':
      return <span>{value ? t('detail.yes') : t('detail.no')}</span>;
    case 'json':
      return (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed break-normal whitespace-pre">
          {entry.text}
        </pre>
      );
    case 'empty':
      return <span className="text-muted-foreground">—</span>;
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

function TimelineItem({
  icon: Icon,
  title,
  time,
  detail,
  tone = 'default',
}: {
  icon: LucideIcon;
  title: ReactNode;
  time: string;
  detail?: ReactNode;
  tone?: 'default' | 'warning' | 'info' | 'success';
}) {
  const { i18n } = useTranslation();
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span
        className={cn(
          'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-surface',
          tone === 'warning' && 'border-warning/40 text-warning',
          tone === 'info' && 'border-info/40 text-info',
          tone === 'success' && 'border-success/40 text-success',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={time}>{formatDateTime(time, i18n.language, 'dd MMM yyyy HH:mm:ss')}</time>{' '}
          · {formatRelativeTime(time, i18n.language)}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function AlertTimeline({ alert }: { alert: AlertDto }) {
  const { t } = useTranslation('alerts');
  const who = useWho();
  return (
    <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-border">
      <TimelineItem
        icon={BellRing}
        tone="warning"
        title={t('detail.timeline.raised')}
        time={alert.occurredAt}
      />
      {(alert.occurrences > 1 || alert.lastOccurredAt !== alert.occurredAt) && (
        <TimelineItem
          icon={Repeat}
          tone="warning"
          title={t('detail.timeline.recurred', { count: alert.occurrences })}
          time={alert.lastOccurredAt}
        />
      )}
      {alert.acknowledgedAt && (
        <TimelineItem
          icon={Eye}
          tone="info"
          title={t('detail.timeline.acknowledged')}
          time={alert.acknowledgedAt}
          detail={alert.acknowledgedBy ? t('detail.by', { who: who(alert.acknowledgedBy) }) : null}
        />
      )}
      {alert.resolvedAt && (
        <TimelineItem
          icon={CheckCheck}
          tone="success"
          title={t('detail.timeline.resolved')}
          time={alert.resolvedAt}
          detail={alert.resolvedBy ? t('detail.by', { who: who(alert.resolvedBy) }) : null}
        />
      )}
    </ol>
  );
}

const CHANNEL_ICON = { email: Mail, telegram: Send, webhook: Webhook } as const;
const DELIVERY_VARIANT: Record<string, 'success' | 'danger' | 'info' | 'muted'> = {
  sent: 'success',
  queued: 'info',
  failed: 'danger',
  pending: 'muted',
  sending: 'info',
};

function AlertDeliveries({ alertId }: { alertId: string }) {
  const { t, i18n } = useTranslation('alerts');
  const query = useNotificationsControllerDeliveries({ alertId, limit: 20 });
  if (query.isPending) return <Skeleton className="h-16 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} size="sm" />;
  const deliveries: DeliveryDto[] = query.data.data;
  if (deliveries.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={MessageCircle}
        title={t('detail.deliveries.empty')}
        description={t('detail.deliveries.emptyHint')}
      />
    );
  return (
    <ul className="divide-y rounded-lg border">
      {deliveries.map((delivery) => {
        const Icon = CHANNEL_ICON[delivery.channel] ?? Send;
        return (
          <li key={delivery.id} className="flex items-start gap-3 p-3 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t(`detail.deliveries.channels.${delivery.channel}`)}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {delivery.target}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t('detail.deliveries.attempts', { count: delivery.attempts })} ·{' '}
                {formatRelativeTime(
                  delivery.sentAt ?? delivery.lastAttemptAt ?? delivery.createdAt,
                  i18n.language,
                )}
              </p>
              {delivery.error && (
                <p className="mt-1 text-xs break-words text-danger">{delivery.error}</p>
              )}
            </div>
            <Badge variant={DELIVERY_VARIANT[delivery.status] ?? 'muted'}>
              {t(`detail.deliveries.status.${delivery.status}`)}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Localized name of a catalog method with its id (the catalog is a lazy chunk, spec §17). */
function MethodName({ methodId }: { methodId: string }) {
  const { i18n } = useTranslation();
  const catalog = useMethodCatalog();
  const name = catalog.data?.getMethod(methodId)?.name[i18n.language === 'en' ? 'en' : 'id'];
  return (
    <span className="flex min-w-0 flex-col whitespace-normal">
      {name && <span className="text-pretty">{name}</span>}
      <span className="font-mono text-xs break-all text-muted-foreground">{methodId}</span>
    </span>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {children}
      </h3>
      {action}
    </div>
  );
}

function AlertDetailBody({ alert }: { alert: AlertDto }) {
  const { t } = useTranslation('alerts');
  const entries = dataEntries(alert.data);
  const hasLocation = alert.lat !== null && alert.lon !== null;
  return (
    <div className="space-y-6 px-4 pb-6 sm:px-6">
      <AlertActions alert={alert} variant="detail" />
      <section className="space-y-3" aria-labelledby="alert-detail-facts">
        <SectionTitle>
          <span id="alert-detail-facts">{t('detail.facts')}</span>
        </SectionTitle>
        <KeyValueList
          dense
          items={[
            {
              key: 'vessel',
              label: t('detail.vessel'),
              value: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <MmsiText mmsi={alert.mmsi} copyable />
                  <Link
                    to={`/vessels/${alert.mmsi}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('detail.openVessel')}
                  </Link>
                </span>
              ),
            },
            ...(alert.relatedMmsi !== null
              ? [
                  {
                    key: 'related',
                    label: t('detail.relatedVessel'),
                    value: <MmsiText mmsi={alert.relatedMmsi} copyable />,
                  },
                ]
              : []),
            {
              key: 'type',
              label: t('detail.type'),
              value: <AlertTypeLabel type={alert.type} domain={alert.domain} showDomain />,
            },
            {
              key: 'method',
              label: t('detail.method'),
              hint: <MethodInfo methodId={alert.methodId} />,
              value: <MethodName methodId={alert.methodId} />,
            },
            ...(hasLocation
              ? [
                  {
                    key: 'position',
                    label: t('detail.position'),
                    value: <CoordinateText lat={alert.lat} lon={alert.lon} copyable />,
                  },
                ]
              : []),
            {
              key: 'occurrences',
              label: t('detail.occurrences'),
              value: <span className="font-mono tabular-nums">{alert.occurrences}×</span>,
            },
            { key: 'source', label: t('detail.source'), value: alert.source || '—' },
          ]}
        />
      </section>

      {hasLocation && (
        <section className="space-y-3" aria-labelledby="alert-detail-location">
          <SectionTitle
            action={
              <Button variant="ghost" size="xs" asChild>
                <Link to={`/map?vessel=${alert.mmsi}`}>
                  <MapPin /> {t('detail.openMap')}
                </Link>
              </Button>
            }
          >
            <span id="alert-detail-location">{t('detail.location')}</span>
          </SectionTitle>
          <Suspense fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
            <AlertMiniMap
              lat={alert.lat as number}
              lon={alert.lon as number}
              severity={alert.severity}
              label={t('detail.locationMap', { title: alert.title })}
            />
          </Suspense>
        </section>
      )}

      {entries.length > 0 && (
        <section className="space-y-3" aria-labelledby="alert-detail-data">
          <SectionTitle>
            <span id="alert-detail-data">{t('detail.data')}</span>
          </SectionTitle>
          <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {entries.map((entry) => (
              <div key={entry.key} className="contents">
                <dt className="truncate text-muted-foreground" title={entry.key}>
                  {t(`detail.dataKeys.${entry.key}`, { defaultValue: entry.key })}
                </dt>
                <dd className="min-w-0">
                  <DataValue entry={entry} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="alert-detail-timeline">
        <SectionTitle>
          <span id="alert-detail-timeline">{t('detail.timeline.title')}</span>
        </SectionTitle>
        <AlertTimeline alert={alert} />
      </section>

      <Can permission="alert_rule:write">
        <section className="space-y-3" aria-labelledby="alert-detail-deliveries">
          <SectionTitle
            action={
              <Button variant="ghost" size="xs" asChild>
                <Link to="/alert-rules">
                  {t('detail.deliveries.rules')} <ArrowUpRight />
                </Link>
              </Button>
            }
          >
            <span id="alert-detail-deliveries">{t('detail.deliveries.title')}</span>
          </SectionTitle>
          <AlertDeliveries alertId={alert.id} />
        </section>
      </Can>
    </div>
  );
}

/** Detail drawer of an alert (`?alert=<id>`): facts, location, detector data, timeline, deliveries. */
export function AlertDetailSheet({
  alertId,
  onOpenChange,
}: {
  alertId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('alerts');
  const queryClient = useQueryClient();
  const query = useAlertsControllerGet(alertId ?? '', {
    query: {
      enabled: !!alertId,
      placeholderData: () => (alertId ? findCachedAlert(queryClient, alertId) : undefined),
    },
  });
  const alert = query.data;

  return (
    <Sheet open={!!alertId} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
        closeLabel={t('common:actions.close')}
        data-testid="alert-detail"
      >
        <SheetHeader className="gap-3 border-b px-4 py-5 sm:px-6">
          {alert ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <SeverityBadge severity={alert.severity} />
                <AlertStatusBadge status={alert.status} />
                <span className="text-xs text-muted-foreground">
                  <AlertTypeLabel type={alert.type} domain={alert.domain} />
                </span>
              </div>
              <SheetTitle className="text-lg leading-snug break-words">{alert.title}</SheetTitle>
              <SheetDescription className="break-words">{alert.message}</SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>{t('detail.title')}</SheetTitle>
              <SheetDescription className="sr-only">{t('detail.loading')}</SheetDescription>
            </>
          )}
        </SheetHeader>
        <div className="pt-5">
          {alert ? (
            <AlertDetailBody alert={alert} />
          ) : query.isError ? (
            <ErrorState
              error={localizeProblem(query.error, alertProblemCopies(t))}
              onRetry={query.refetch}
            />
          ) : (
            <div className="space-y-3 px-6" aria-busy>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
