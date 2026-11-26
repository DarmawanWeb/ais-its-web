import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { useRealtimeConnection } from '@/shared/realtime/hooks';
import { SimpleTooltip } from '@/shared/ui/tooltip';

const DOT: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning',
  reconnecting: 'bg-warning',
  disconnected: 'bg-muted-foreground',
  idle: 'bg-muted-foreground',
  error: 'bg-danger',
};

/** Realtime socket status (dot with tooltip). */
export function RealtimeIndicator() {
  const { t } = useTranslation();
  const { status, error } = useRealtimeConnection();
  const label = t(`shell.realtime.${status}`);
  return (
    <SimpleTooltip label={error && status !== 'connected' ? `${label} (${error})` : label}>
      <span
        className="hidden h-8 items-center gap-2 rounded-md border bg-surface/60 px-2.5 text-xs text-muted-foreground sm:inline-flex"
        role="status"
        aria-label={label}
        data-status={status}
        data-testid="realtime-status"
      >
        <span className="relative flex size-2">
          {status === 'connected' && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-success/60"
              aria-hidden
            />
          )}
          <span className={cn('relative size-2 rounded-full', DOT[status])} aria-hidden />
        </span>
        <span className="font-medium tracking-wide uppercase">Live</span>
      </span>
    </SimpleTooltip>
  );
}
