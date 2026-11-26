import {
  ALERT_STATUS_LABELS,
  alertDomainLabel,
  alertTypeLabel,
  isAlertDomain,
  type AlertStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { CheckCheck, CircleDot, Eye, Radar, ShieldAlert } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { useAppLanguage } from '@/shared/i18n';

const STATUS_VARIANT: Record<AlertStatus, 'warning' | 'info' | 'success'> = {
  open: 'warning',
  acknowledged: 'info',
  resolved: 'success',
};

const STATUS_ICON = { open: CircleDot, acknowledged: Eye, resolved: CheckCheck } as const;

/** Inbox status of an alert (open, acknowledged, resolved) with an icon as second channel. */
export function AlertStatusBadge({ status, className }: { status: string; className?: string }) {
  const locale = useAppLanguage();
  const known = status in STATUS_VARIANT ? (status as AlertStatus) : null;
  if (!known) return <Badge variant="muted">{status}</Badge>;
  const Icon = STATUS_ICON[known];
  return (
    <Badge variant={STATUS_VARIANT[known]} className={cn('gap-1', className)}>
      <Icon aria-hidden />
      {ALERT_STATUS_LABELS[known][locale]}
    </Badge>
  );
}

/** Alert type label (contracts registry; unknown future types are shown as they are). */
export function AlertTypeLabel({
  type,
  domain,
  className,
  showDomain = false,
}: {
  type: string;
  domain?: string;
  className?: string;
  showDomain?: boolean;
}) {
  const locale = useAppLanguage();
  const Icon = domain === 'surveillance' ? Radar : ShieldAlert;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{alertTypeLabel(type, locale)}</span>
      {showDomain && domain && isAlertDomain(domain) && (
        <span className="shrink-0 text-muted-foreground">· {alertDomainLabel(domain, locale)}</span>
      )}
    </span>
  );
}

/** Small coloured dot of a severity (decorative; the severity is always also written out). */
export function SeverityDot({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        severity === 'critical' && 'bg-danger',
        severity === 'warning' && 'bg-warning',
        severity === 'info' && 'bg-info',
        !['critical', 'warning', 'info'].includes(severity) && 'bg-muted-foreground',
        className,
      )}
    />
  );
}
