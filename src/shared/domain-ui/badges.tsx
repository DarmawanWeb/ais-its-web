import {
  ALERT_SEVERITY_LABELS,
  CII_GRADE_LABELS,
  COLLISION_RISK_LABELS,
  EWS_STATUS_LABELS,
  isNavStatus,
  NAV_STATUS_LABELS,
  PREDICTED_NAV_STATUS_LABELS,
  type AlertSeverity,
  type CiiGrade,
  type CollisionRisk,
  type EwsStatus,
  type PredictedNavStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import { currentLanguage } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';
import { gradeClassName } from '@/shared/theme/grade';
import { Badge } from '@/shared/ui/badge';

function useLocale(): 'id' | 'en' {
  const { i18n } = useTranslation();
  return i18n.language === 'en' ? 'en' : currentLanguage();
}

/** CII rating grade A–E with the IMO colour scale. */
export function CiiGradeBadge({
  grade,
  showLabel = false,
  size = 'md',
  className,
}: {
  grade: CiiGrade | null | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  if (!grade) return <span className="text-muted-foreground">—</span>;
  const label = CII_GRADE_LABELS[grade][locale];
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      title={`${t('domain.ciiGrade', { grade })} — ${label}`}
    >
      <span
        aria-label={t('domain.ciiGrade', { grade })}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-bold shadow-xs ring-1 ring-black/10 ring-inset',
          gradeClassName(grade),
          size === 'sm' && 'size-5 text-[11px]',
          size === 'md' && 'size-7 text-sm',
          size === 'lg' && 'size-11 text-xl',
        )}
      >
        {grade}
      </span>
      {showLabel && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}

const EWS_VARIANT: Record<EwsStatus, 'danger' | 'warning' | 'success'> = {
  0: 'danger',
  1: 'warning',
  3: 'success',
};

/** Pipeline early-warning status (0 danger, 1 warning, 3 safe). */
export function EwsStatusBadge({
  status,
  className,
}: {
  status: EwsStatus | null | undefined;
  className?: string;
}) {
  const locale = useLocale();
  if (status === null || status === undefined)
    return <span className="text-muted-foreground">—</span>;
  const variant = EWS_VARIANT[status];
  return (
    <Badge variant={variant} className={cn('gap-1.5', className)}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          variant === 'danger' && 'animate-pulse bg-danger',
          variant === 'warning' && 'bg-warning',
          variant === 'success' && 'bg-success',
        )}
        aria-hidden
      />
      {EWS_STATUS_LABELS[status][locale]}
    </Badge>
  );
}

const SEVERITY_VARIANT: Record<AlertSeverity, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

/** Alert / event severity (info, warning, critical). */
export function SeverityBadge({
  severity,
  className,
}: {
  /** Known severities get their colour; unknown values are shown as is. */
  severity: string | null | undefined;
  className?: string;
}) {
  const locale = useLocale();
  if (!severity) return <span className="text-muted-foreground">—</span>;
  const known = severity in SEVERITY_VARIANT ? (severity as AlertSeverity) : null;
  return (
    <Badge variant={known ? SEVERITY_VARIANT[known] : 'muted'} className={className}>
      {known ? ALERT_SEVERITY_LABELS[known][locale] : severity}
    </Badge>
  );
}

const RISK_VARIANT: Record<CollisionRisk, 'muted' | 'info' | 'warning' | 'danger'> = {
  none: 'muted',
  low: 'info',
  medium: 'warning',
  high: 'danger',
};

/** Collision risk band from CPA/TCPA. */
export function CollisionRiskBadge({
  risk,
  className,
}: {
  risk: CollisionRisk | null | undefined;
  className?: string;
}) {
  const locale = useLocale();
  if (!risk) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={RISK_VARIANT[risk]} className={className}>
      {COLLISION_RISK_LABELS[risk][locale]}
    </Badge>
  );
}

/** AIS navigational status label (contracts labels, id/en), optionally with the predicted status. */
export function NavstatusLabel({
  code,
  predicted,
  showCode = false,
  className,
}: {
  code: number | null | undefined;
  predicted?: PredictedNavStatus | null;
  showCode?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  if (code === null || code === undefined) return <span className="text-muted-foreground">—</span>;
  const label = isNavStatus(code) ? NAV_STATUS_LABELS[code][locale] : String(code);
  return (
    <span className={cn('inline-flex min-w-0 flex-col', className)}>
      <span className="truncate">
        {showCode && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{code}</span>}
        {label}
      </span>
      {predicted !== undefined && predicted !== null && (
        <span className="truncate text-xs text-muted-foreground">
          {PREDICTED_NAV_STATUS_LABELS[predicted][locale]}
        </span>
      )}
    </span>
  );
}
