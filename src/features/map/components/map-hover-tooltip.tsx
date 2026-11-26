import {
  isNavStatus,
  NAV_STATUS_LABELS,
  ZONE_KIND_LABELS,
  isZoneKind,
} from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import { useMapContext } from '@/shared/map';
import { formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { safetyRingKind } from '@/shared/map/vessel-layer';
import { realtime } from '@/shared/realtime/client';
import { rgbaToCss, SAFETY_COLORS } from '@/shared/theme/tokens';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { vesselCategory } from '../lib/vessel-filters';

const WIDTH = 248;

/**
 * Hover card of the live map (inside <MapView>): vessel name, MMSI, SOG/COG, navstatus, last
 * seen and safety state — or the name and kind of a zone. Visual only (`aria-hidden`): the same
 * facts are in the vessel panel, which keyboard and screen-reader users reach through search.
 */
export function MapHoverTooltip() {
  const { t, i18n } = useTranslation('map');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const { map } = useMapContext();
  const hover = useLiveMapStore((state) => state.hover);
  if (!hover) return null;
  const container = map.getContainer();
  const left = hover.x + 16 + WIDTH > container.clientWidth ? hover.x - WIDTH - 12 : hover.x + 16;
  const top = Math.min(hover.y + 16, Math.max(8, container.clientHeight - 170));
  const style = { left: Math.max(8, left), top, width: WIDTH };

  if (hover.kind === 'zone') {
    return (
      <div
        aria-hidden
        className="glass-panel pointer-events-none absolute z-20 rounded-lg border px-3 py-2 text-xs shadow-elevated"
        style={style}
      >
        <p className="truncate text-sm font-semibold">{hover.name}</p>
        <p className="text-muted-foreground">
          {isZoneKind(hover.zoneKind) ? ZONE_KIND_LABELS[hover.zoneKind][locale] : hover.zoneKind} ·{' '}
          {hover.global ? t('tooltip.globalZone') : t('tooltip.orgZone')}
        </p>
      </div>
    );
  }

  const record = realtime.vessels.get(hover.mmsi);
  if (!record) return null;
  const position = record.position;
  const kind = safetyRingKind(record);
  const number = (value: number | undefined, digits = 1) =>
    value === undefined
      ? '—'
      : formatNumber(value, i18n.language, {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        });
  const cog = position && position.cog < 360 ? `${number(position.cog, 0)}°` : '—';
  const sog = position && position.sog < 102.3 ? `${number(position.sog)} kn` : '—';
  const nav = position?.navstatus;

  return (
    <div
      aria-hidden
      className="glass-panel pointer-events-none absolute z-20 rounded-lg border px-3 py-2.5 text-xs shadow-elevated"
      style={style}
      data-testid="map-hover-tooltip"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {record.vessel?.name ?? t('vessel.unknownName')}
          </p>
          <p className="font-mono text-muted-foreground tabular-nums">MMSI {record.mmsi}</p>
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t(`categories.${vesselCategory(record)}`)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase">SOG</dt>
          <dd className="font-mono tabular-nums">{sog}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground uppercase">COG</dt>
          <dd className="font-mono tabular-nums">{cog}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] text-muted-foreground uppercase">{t('vessel.navstatus')}</dt>
          <dd className="truncate">
            {nav !== undefined && isNavStatus(nav) ? NAV_STATUS_LABELS[nav][locale] : '—'}
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-1.5 text-[11px] text-muted-foreground">
        <span>
          {t('tooltip.lastSeen', { time: formatRelativeTime(record.updatedAt, i18n.language) })}
        </span>
        {kind && (
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <span
              className="size-2.5 rounded-full border-2"
              style={{
                borderColor: rgbaToCss(SAFETY_COLORS[kind]),
                borderStyle: kind === 'collisionMedium' ? 'dashed' : 'solid',
              }}
            />
            {t(`safety.${kind}`)}
          </span>
        )}
      </div>
    </div>
  );
}
