import { Building2, Calendar, Compass, Gauge, Lock, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { NavstatusLabel } from '@/shared/domain-ui/badges';
import { MmsiText, UnitValue } from '@/shared/domain-ui/values';
import type { VesselLiveRecord } from '@/shared/realtime';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

import { type AnyVessel, isDetailView, positionFreshness } from '../lib/vessel';
import { nowMs } from '@/shared/lib/clock';
import { FlagText } from './flag-text';
import { LastSeen } from './last-seen';
import { VesselPhoto } from './vessel-photo';
import { VesselStatusBadge } from './vessel-status-badge';

function Metric({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Gauge;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/50 px-3 py-2">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="line-clamp-2 text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

/** Header of the vessel page: photo, name (the page's h1), identity chips and live metrics. */
export function VesselHero({
  vessel,
  live,
  ownership,
  actions,
}: {
  vessel: AnyVessel;
  live: VesselLiveRecord | undefined;
  /** own = the active organization's vessel, platform = super_admin access, other = identity only. */
  ownership: 'own' | 'platform' | 'other';
  actions?: ReactNode;
}) {
  const { t } = useTranslation('vessels');
  const position = live?.position ?? null;
  const freshness = positionFreshness(position?.time ?? null, nowMs());
  const detail = isDetailView(vessel) ? vessel : null;
  return (
    <section
      aria-labelledby="vessel-title"
      className="overflow-hidden rounded-2xl border bg-surface shadow-xs"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <VesselPhoto
          url={vessel.photoUrl}
          name={t('detail.photoAlt', { name: vessel.name })}
          size="hero"
          className="rounded-none border-0 border-b md:aspect-auto md:h-full md:min-h-56 md:border-r md:border-b-0"
        />
        <div className="flex min-w-0 flex-col gap-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                {vessel.type.name}
              </p>
              <h1 id="vessel-title" className="text-2xl font-semibold tracking-tight text-balance">
                {vessel.name}
              </h1>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </div>
          <ul
            className="flex flex-wrap items-center gap-2 text-sm"
            aria-label={t('detail.identity')}
          >
            <li>
              <VesselStatusBadge status={vessel.status} />
            </li>
            <li className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
              <span className="text-xs text-muted-foreground">{t('fields.mmsi')}</span>
              <MmsiText mmsi={vessel.mmsi} copyable />
            </li>
            <li className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
              <span className="text-xs text-muted-foreground">{t('fields.imo')}</span>
              <span className="font-mono text-[0.92em]">{vessel.imo ?? '—'}</span>
            </li>
            <li className="inline-flex items-center rounded-md border px-2 py-0.5">
              <FlagText code={vessel.flag} />
            </li>
            {detail?.builtYear && (
              <li className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5">
                <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                {t('detail.built', { year: detail.builtYear })}
              </li>
            )}
            <li>
              {ownership === 'own' ? (
                <Badge variant="primary" className="gap-1">
                  <Building2 /> {t('detail.ownFleet')}
                </Badge>
              ) : ownership === 'platform' ? (
                <Badge variant="info" className="gap-1">
                  <Building2 /> {t('detail.platformAccess')}
                </Badge>
              ) : (
                <Badge variant="muted" className="gap-1">
                  <Lock /> {t('detail.otherOrg')}
                </Badge>
              )}
            </li>
          </ul>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
            <Metric icon={Gauge} label={t('live.sog')}>
              <UnitValue value={position?.sog ?? null} unit="knots" />
            </Metric>
            <Metric icon={Compass} label={t('live.cog')}>
              <UnitValue value={position?.cog ?? null} unit="deg" />
            </Metric>
            <Metric icon={Radio} label={t('live.navstatus')}>
              <NavstatusLabel code={position?.navstatus ?? null} />
            </Metric>
            <div
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2',
                freshness === 'live' ? 'border-success/40 bg-success/8' : 'bg-background/50',
              )}
            >
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                {freshness === 'live' && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                )}
                <span
                  className={cn(
                    'relative inline-flex size-2.5 rounded-full',
                    freshness === 'live' ? 'bg-success' : 'bg-muted-foreground',
                  )}
                />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t('columns.lastSeen')}
                </p>
                <LastSeen time={position?.time ?? null} className="font-medium" dot={false} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
