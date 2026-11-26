import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  History,
  Loader,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type {
  AlertRuleDto,
  DeliveryDto,
  NotificationsControllerDeliveriesStatus,
} from '@/shared/api/generated/notification/model';
import { SeverityBadge } from '@/shared/domain-ui/badges';
import { useCursorState } from '@/shared/domain-ui/data-table';
import { CursorPaginationBar } from '@/shared/domain-ui/data-table/pagination-bar';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { useDeliveries } from '../api/rules-api';
import { shortTarget } from '../lib/channels';
import { ChannelIcon } from './rule-bits';

const FILTERS = ['all', 'sent', 'queued', 'pending', 'failed'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_STYLE = {
  sent: { icon: CircleCheck, variant: 'success' },
  queued: { icon: Clock3, variant: 'info' },
  pending: { icon: CircleDashed, variant: 'warning' },
  sending: { icon: Loader, variant: 'info' },
  failed: { icon: CircleAlert, variant: 'danger' },
} as const;

function DeliveryItem({ delivery }: { delivery: DeliveryDto }) {
  const { t, i18n } = useTranslation('alert-rules');
  const style = STATUS_STYLE[delivery.status];
  const Icon = style.icon;
  const time = delivery.sentAt ?? delivery.lastAttemptAt ?? delivery.createdAt;
  return (
    <li className="space-y-2 rounded-lg border bg-background/40 p-3" data-testid="delivery-item">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={style.variant}>
          <Icon aria-hidden /> {t(`deliveries.status.${delivery.status}`)}
        </Badge>
        <SeverityBadge severity={delivery.severity} />
        <span
          className="ml-auto text-xs text-muted-foreground"
          title={formatDateTime(time, i18n.language, 'dd MMM yyyy HH:mm:ss')}
        >
          {formatRelativeTime(time, i18n.language)}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <ChannelIcon type={delivery.channel} className="text-muted-foreground" />
        <span className="sr-only">{t(`channels.types.${delivery.channel}`)}: </span>
        <span className="truncate font-mono text-xs">
          {shortTarget({ type: delivery.channel, target: delivery.target })}
        </span>
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>{t('deliveries.attempts', { count: delivery.attempts })}</span>
        {delivery.status === 'pending' && (
          <span>
            {t('deliveries.nextAttempt', {
              time: formatDateTime(delivery.nextAttemptAt, i18n.language, 'dd MMM HH:mm:ss'),
            })}
          </span>
        )}
        <Link
          to={`/alerts?alert=${encodeURIComponent(delivery.alertId)}`}
          className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
        >
          {t('deliveries.openAlert')} <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </p>
      {delivery.error && (
        <p className="rounded-md border border-danger/30 bg-danger/8 px-2 py-1.5 font-mono text-[11px] break-words text-danger">
          {delivery.error}
        </p>
      )}
    </li>
  );
}

function DeliveryList({ ruleId }: { ruleId: string | undefined }) {
  const { t } = useTranslation('alert-rules');
  const [filter, setFilter] = useState<Filter>('all');
  const cursor = useCursorState();
  const status: NotificationsControllerDeliveriesStatus | undefined =
    filter === 'all' ? undefined : filter;
  const deliveries = useDeliveries({ ruleId, status, cursor: cursor.cursor });
  const items = deliveries.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            if (!value) return;
            setFilter(value as Filter);
            cursor.reset();
          }}
          aria-label={t('deliveries.filter')}
          className="flex-wrap"
        >
          {FILTERS.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(`deliveries.filters.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {t('deliveries.retryHint')} <MethodInfo methodId="notify.delivery_retry_backoff" />
        </span>
      </div>
      {deliveries.isPending ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : deliveries.isError ? (
        <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} size="sm" />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={History}
          title={filter === 'all' ? t('deliveries.empty') : t('deliveries.emptyFiltered')}
          description={t('deliveries.emptyHint')}
        />
      ) : (
        <ul
          className={cn('space-y-2', deliveries.isFetching && 'opacity-70')}
          aria-label={t('deliveries.listLabel')}
        >
          {items.map((delivery) => (
            <DeliveryItem key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      )}
      <CursorPaginationBar
        pagination={cursor.adapter(deliveries.data?.page.nextCursor, deliveries.isFetching)}
      />
    </div>
  );
}

/** Delivery log of one rule (GET /notifications/deliveries?ruleId=…), newest first. */
export function DeliveriesSheet({
  rule,
  onOpenChange,
}: {
  rule: AlertRuleDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('alert-rules');
  return (
    <Sheet open={rule !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" closeLabel={t('common:actions.close')}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle>{t('deliveries.title')}</SheetTitle>
          <SheetDescription>
            {rule ? t('deliveries.description', { name: rule.name }) : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {rule && <DeliveryList key={rule.id} ruleId={rule.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
