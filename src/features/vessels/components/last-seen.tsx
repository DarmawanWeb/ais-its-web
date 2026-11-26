import { useTranslation } from 'react-i18next';

import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

import { positionFreshness } from '../lib/vessel';
import { nowMs } from '@/shared/lib/clock';

const DOT = {
  live: 'bg-success',
  recent: 'bg-warning',
  stale: 'bg-muted-foreground',
  none: 'bg-border',
} as const;

/** Time of the latest AIS position: freshness dot (with text) and relative time. */
export function LastSeen({
  time,
  className,
  dot = true,
}: {
  time: string | null | undefined;
  className?: string;
  /** false when the surrounding element already shows the freshness. */
  dot?: boolean;
}) {
  const { t, i18n } = useTranslation('vessels');
  const freshness = positionFreshness(time, nowMs());
  if (!time) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>{t('lastSeen.never')}</span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm whitespace-nowrap', className)}
      title={formatDateTime(time, i18n.language, 'dd MMM yyyy HH:mm:ss')}
    >
      {dot && <span className={cn('size-2 shrink-0 rounded-full', DOT[freshness])} aria-hidden />}
      <span className="sr-only">{t(`lastSeen.${freshness}`)}: </span>
      {formatRelativeTime(time, i18n.language)}
    </span>
  );
}
