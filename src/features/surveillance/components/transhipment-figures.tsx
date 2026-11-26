import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

/**
 * Transhipment score 0–100 (`transhipment.accuracy`) on a bar with the detection threshold and
 * the critical level marked; the value is always printed (never colour alone).
 */
export function AccuracyMeter({
  value,
  threshold = 70,
  critical = 90,
  size = 'md',
  className,
}: {
  value: number | null | undefined;
  threshold?: number;
  critical?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t, i18n } = useTranslation('surveillance');
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  const clamped = Math.max(0, Math.min(100, value));
  const tone = value >= critical ? 'bg-danger' : value >= threshold ? 'bg-warning' : 'bg-info';
  const text = formatNumber(value, i18n.language, { maximumFractionDigits: size === 'sm' ? 1 : 2 });
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(value.toFixed(2))}
        aria-label={t('fields.accuracy')}
        aria-valuetext={`${text} %`}
        className={cn(
          'relative flex-1 overflow-visible rounded-full bg-muted',
          size === 'sm' ? 'h-1.5 min-w-16' : 'h-2.5 min-w-28',
        )}
      >
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${clamped}%` }} />
        <span
          className="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 rounded-full bg-foreground/70"
          style={{ left: `${threshold}%` }}
          title={t('transhipment.threshold', { value: threshold })}
          aria-hidden
        />
        {size === 'md' && (
          <span
            className="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 rounded-full bg-danger/80"
            style={{ left: `${critical}%` }}
            title={t('transhipment.critical', { value: critical })}
            aria-hidden
          />
        )}
      </div>
      <span
        className={cn(
          'shrink-0 font-mono tabular-nums',
          size === 'sm' ? 'text-xs' : 'text-sm font-semibold',
        )}
      >
        {text} %
      </span>
    </div>
  );
}

const LEVELS = [
  { key: 'low', className: 'bg-primary/35' },
  { key: 'medium', className: 'bg-primary/65' },
  { key: 'high', className: 'bg-primary' },
] as const;

/**
 * Share of low / medium / high product priorities of the positive checks
 * (`transhipment.priority_distribution`): an ordinal single-hue stack with a 2 px gap between
 * segments and the percentages printed in the legend.
 */
export function PriorityDistributionBar({
  distribution,
  compact = false,
  className,
}: {
  distribution: { low: number; medium: number; high: number } | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation('surveillance');
  if (!distribution) return <span className="text-muted-foreground">—</span>;
  const total = distribution.low + distribution.medium + distribution.high || 1;
  const label = LEVELS.map(
    (level) =>
      `${t(`transhipment.levels.${level.key}`)} ${formatNumber(distribution[level.key], i18n.language, { maximumFractionDigits: 0 })} %`,
  ).join(', ');
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div
        className={cn(
          'flex w-full gap-0.5 overflow-hidden rounded-full',
          compact ? 'h-1.5 min-w-20' : 'h-3',
        )}
        role="img"
        aria-label={label}
      >
        {LEVELS.map((level) =>
          distribution[level.key] > 0 ? (
            <div
              key={level.key}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', level.className)}
              style={{ width: `${(distribution[level.key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      {!compact && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {LEVELS.map((level) => (
            <li key={level.key} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-sm', level.className)} aria-hidden />
              {t(`transhipment.levels.${level.key}`)}
              <span className="font-mono text-foreground tabular-nums">
                {formatNumber(distribution[level.key], i18n.language, { maximumFractionDigits: 0 })}{' '}
                %
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
