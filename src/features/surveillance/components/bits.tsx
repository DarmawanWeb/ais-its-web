import { SURVEILLANCE_EVENT_STATUS_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { CircleCheck, CircleDot, CircleSlash, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { MmsiText } from '@/shared/domain-ui/values';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { durationParts } from '../lib/event-data';

const STATUS_STYLE = {
  open: { variant: 'info', icon: CircleDot },
  confirmed: { variant: 'danger', icon: ShieldCheck },
  dismissed: { variant: 'muted', icon: CircleSlash },
  resolved: { variant: 'success', icon: CircleCheck },
} as const;

type EventStatus = keyof typeof STATUS_STYLE;

function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && value in STATUS_STYLE;
}

/** Review status of an event (contracts labels; icon + text, never colour alone). */
export function EventStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { i18n } = useTranslation();
  if (!isEventStatus(status)) return <span className="text-muted-foreground">—</span>;
  const { variant, icon: Icon } = STATUS_STYLE[status];
  const locale = i18n.language === 'en' ? 'en' : 'id';
  return (
    <Badge variant={variant} className={cn('gap-1', className)}>
      <Icon className="size-3" aria-hidden />
      {SURVEILLANCE_EVENT_STATUS_LABELS[status][locale]}
    </Badge>
  );
}

/** Vessel name with its MMSI; the name links to the vessel page (`/vessels/:mmsi`). */
export function VesselCell({
  mmsi,
  name,
  className,
}: {
  mmsi: number | null | undefined;
  name: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation('surveillance');
  if (mmsi === null || mmsi === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <Link
        to={`/vessels/${mmsi}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="truncate font-medium hover:text-primary hover:underline"
        title={name ?? undefined}
      >
        {name ?? t('common.unknownVessel')}
      </Link>
      <MmsiText mmsi={mmsi} className="text-xs text-muted-foreground" />
    </span>
  );
}

/** A duration in minutes as "1 h 4 j 12 mnt" / "1 d 4 h 12 min". */
export function DurationText({
  minutes,
  className,
}: {
  minutes: number | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation('surveillance');
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const parts = durationParts(minutes);
  const text = [
    parts.days > 0 ? t('duration.days', { count: parts.days }) : null,
    parts.hours > 0 ? t('duration.hours', { count: parts.hours }) : null,
    parts.minutes > 0 || (parts.days === 0 && parts.hours === 0)
      ? t('duration.minutes', { count: parts.minutes })
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={cn('font-mono tabular-nums', className)}>{text}</span>;
}

/** Label + value pair for compact metric rows inside cards. */
export function Metric({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * Column header that may take two lines (table headers do not wrap by default), with an
 * optional method popover after the text.
 */
export function ColumnHeading({
  children,
  methodId,
  className,
}: {
  children: React.ReactNode;
  methodId?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="inline-block max-w-28 leading-tight whitespace-normal">{children}</span>
      {methodId && <MethodInfo methodId={methodId} />}
    </span>
  );
}
