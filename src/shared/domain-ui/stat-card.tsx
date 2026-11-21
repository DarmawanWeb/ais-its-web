import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

import { MethodInfo } from './method-info';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Unit or suffix shown after the value. */
  unit?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Change versus a previous period, e.g. { value: '+4.2%', direction: 'up' }. */
  trend?: { value: ReactNode; direction: 'up' | 'down'; positive?: boolean };
  /** Methodology id of the computed figure (renders the ⓘ source popover). */
  methodId?: string;
  loading?: boolean;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
  footer?: ReactNode;
}

const TONE_CLASSES = {
  default: 'text-muted-foreground bg-muted',
  primary: 'text-primary bg-primary/12',
  success: 'text-success bg-success/12',
  warning: 'text-warning bg-warning/12',
  danger: 'text-danger bg-danger/12',
} as const;

/** KPI tile: label, big tabular value, unit, trend and an optional method source. */
export function StatCard({
  label,
  value,
  unit,
  description,
  icon: Icon,
  trend,
  methodId,
  loading = false,
  tone = 'default',
  className,
  footer,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-surface p-4 shadow-xs',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground">
          <span className="truncate">{label}</span>
          {methodId && <MethodInfo methodId={methodId} />}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              TONE_CLASSES[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
      )}
      {(description || trend) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                (trend.positive ?? trend.direction === 'up') ? 'text-success' : 'text-danger',
              )}
            >
              {trend.direction === 'up' ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {trend.value}
            </span>
          )}
          {description && <span className="truncate">{description}</span>}
        </div>
      )}
      {footer}
    </div>
  );
}
