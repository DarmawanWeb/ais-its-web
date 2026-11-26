import { Activity, ArrowLeftRight, EyeOff, Fish, LayoutGrid, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { cn } from '@/shared/lib/utils';
import { useRealtimeConnection } from '@/shared/realtime/hooks';

const ITEMS: { to: string; key: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/surveillance', key: 'overview', icon: LayoutGrid, end: true },
  { to: '/surveillance/transhipment', key: 'transhipment', icon: ArrowLeftRight },
  { to: '/surveillance/fishing', key: 'fishing', icon: Fish },
  { to: '/surveillance/dark', key: 'dark', icon: EyeOff },
  { to: '/surveillance/anomaly', key: 'anomaly', icon: Activity },
];

/** Section navigation between the surveillance pages, with the realtime state. */
export function SurveillanceNav() {
  const { t } = useTranslation('surveillance');
  const { connected } = useRealtimeConnection();
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <nav aria-label={t('nav.section')} className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max items-center gap-1 rounded-xl border bg-surface/70 p-1 shadow-xs">
          {ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    isActive && 'bg-primary/12 text-primary hover:bg-primary/15 hover:text-primary',
                  )
                }
              >
                <item.icon className="size-4" aria-hidden />
                {t(`nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <span className="relative flex size-2" aria-hidden>
          {connected && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          )}
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              connected ? 'bg-success' : 'bg-muted-foreground',
            )}
          />
        </span>
        {connected ? t('live.connected') : t('live.disconnected')}
      </p>
    </div>
  );
}
