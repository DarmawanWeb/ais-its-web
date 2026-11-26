import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import type { LegendItem } from '@/shared/map';
import { useRealtimeConnection } from '@/shared/realtime/hooks';
import {
  type Rgba,
  rgbaToCss,
  SAFETY_COLORS,
  SAFETY_RING_STYLES,
  type SafetyRingKind,
} from '@/shared/theme/tokens';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { riskRgba } from '../lib/encounters';
import { EVENT_TYPE_STYLE, HEATMAP_COLORS } from '../lib/surveillance';
import { vesselLod } from '../lib/vessel-layers';
import { ZONE_KIND_COLORS } from '../lib/zones-style';

const RING_KINDS: readonly SafetyRingKind[] = [
  'ewsDanger',
  'ewsWarning',
  'collisionHigh',
  'collisionMedium',
];

/**
 * Status bar of the live map (top centre): live connection, vessels drawn (`vessel-count`,
 * after the filters) out of those in view, and the safety counts with their ring styles.
 */
export function MapStatusBar({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation('map');
  const { status } = useRealtimeConnection();
  const { stats, inView, zoom } = useLiveMapStore(
    useShallow((s) => ({ stats: s.stats, inView: s.inView, zoom: s.zoom })),
  );
  const filtered = stats.total !== inView;
  const lod = vesselLod(zoom, stats.total);
  return (
    <div
      className={cn(
        'glass-panel flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-1.5 text-xs shadow-panel',
        compact ? 'rounded-xl' : 'rounded-full',
      )}
      {...(compact ? {} : { 'data-testid': 'map-status' })}
    >
      <span
        className="inline-flex items-center gap-1.5 font-medium"
        {...(compact ? {} : { role: 'status' })}
      >
        <span className="relative flex size-2">
          {status === 'connected' && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-success/60"
              aria-hidden
            />
          )}
          <span
            aria-hidden
            className={cn(
              'relative size-2 rounded-full',
              status === 'connected'
                ? 'bg-success'
                : status === 'error'
                  ? 'bg-danger'
                  : 'bg-warning',
            )}
          />
        </span>
        {t(`status.${status}`)}
      </span>
      <span className="h-3.5 w-px bg-border" aria-hidden />
      <span className="inline-flex items-baseline gap-1">
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          {...(compact ? {} : { 'data-testid': 'vessel-count' })}
        >
          {stats.total}
        </span>
        <span className="text-muted-foreground">
          {filtered
            ? t('status.vesselsOf', { count: inView, total: formatNumber(inView, i18n.language) })
            : t('status.vessels', { count: stats.total })}
        </span>
      </span>
      {lod !== 'icon' && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t(`status.lod.${lod}`)}
        </span>
      )}
      {RING_KINDS.some((kind) => stats[kind] > 0) && (
        <span className="h-3.5 w-px bg-border" aria-hidden />
      )}
      {RING_KINDS.filter((kind) => stats[kind] > 0).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1" title={t(`safety.${kind}`)}>
          <span
            aria-hidden
            className="size-3 rounded-full border-2"
            style={{
              borderColor: rgbaToCss(SAFETY_COLORS[kind]),
              borderStyle: SAFETY_RING_STYLES[kind].line,
            }}
          />
          <span className="font-mono font-semibold tabular-nums">{stats[kind]}</span>
          <span className="sr-only">{t(`safety.${kind}`)}</span>
        </span>
      ))}
    </div>
  );
}

function Swatch({ item }: { item: LegendItem }) {
  switch (item.shape) {
    case 'ring':
    case 'ring-dashed':
      return (
        <span
          className="size-3.5 shrink-0 rounded-full border-2"
          style={{
            borderColor: item.color,
            borderStyle: item.shape === 'ring-dashed' ? 'dashed' : 'solid',
          }}
        />
      );
    case 'line':
      return (
        <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      );
    case 'square':
      return (
        <span className="size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 12 12" className="size-3.5 shrink-0" aria-hidden>
          <path d="M6 0.5 10.5 11 6 8.5 1.5 11Z" fill={item.color} />
        </svg>
      );
    default:
      return (
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      );
  }
}

/**
 * Legend of the live map: folded, a strip of the safety ring styles; unfolded, every symbol
 * of the active layers in two columns and the methods behind the rings.
 */
export function MapLegendPanel() {
  const { t } = useTranslation('map');
  const layers = useLiveMapStore((s) => s.layers);
  const [expanded, setExpanded] = useState(false);
  const rings: LegendItem[] = RING_KINDS.map((kind) => ({
    label: t(`safety.${kind}`),
    color: rgbaToCss(SAFETY_COLORS[kind]),
    shape:
      SAFETY_RING_STYLES[kind].line === 'dashed' ? ('ring-dashed' as const) : ('ring' as const),
  }));
  const items: LegendItem[] = [
    { label: t('legend.normal'), color: '#f5b301', shape: 'arrow' },
    ...rings,
    { label: t('legend.selected'), color: rgbaToCss(SAFETY_COLORS.selected), shape: 'ring' },
  ];
  if (layers.has('pipelines'))
    items.push({ label: t('legend.pipeline'), color: ZONE_KIND_COLORS.pipeline, shape: 'line' });
  if (layers.has('zones'))
    items.push(
      { label: t('legend.restricted'), color: ZONE_KIND_COLORS.restricted, shape: 'square' },
      { label: t('legend.anchorage'), color: ZONE_KIND_COLORS.anchorage, shape: 'square' },
      {
        label: t('legend.transhipment'),
        color: ZONE_KIND_COLORS.transhipment_area,
        shape: 'square',
      },
      { label: t('legend.fishingGround'), color: ZONE_KIND_COLORS.fishing_ground, shape: 'square' },
    );
  if (layers.has('encounters'))
    items.push({ label: t('legend.encounter'), color: rgbaToCss(riskRgba('high')), shape: 'line' });
  if (layers.has('events'))
    items.push({
      label: t('legend.events'),
      color: rgbaToCss(EVENT_TYPE_STYLE.transhipment?.color ?? [167, 139, 250, 255]),
      shape: 'dot',
    });
  if (layers.has('heatmap'))
    items.push({
      label: t('legend.heatmap'),
      color: rgbaToCss((HEATMAP_COLORS[4] as Rgba | undefined) ?? [234, 88, 12, 230]),
      shape: 'square',
    });

  return (
    <div
      className="glass-panel w-[min(21rem,calc(100vw-5rem))] rounded-xl border text-xs shadow-elevated"
      data-testid="map-legend"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold"
      >
        {t('legend.title')}
        <ChevronDown
          className={cn('size-3.5 transition-transform', !expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t px-3 py-2">
        {(expanded ? items : rings).map((item, index) => (
          <li
            key={`${item.color}-${item.shape ?? 'dot'}-${index}`}
            className="flex min-w-0 items-center gap-2"
          >
            <span className="flex w-4 shrink-0 justify-center">
              <Swatch item={item} />
            </span>
            <span className="text-muted-foreground">{item.label}</span>
          </li>
        ))}
      </ul>
      {expanded && (
        <div className="flex items-center gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="mr-auto">{t('legend.methods')}</span>
          <span className="inline-flex items-center">
            EWS <MethodInfo methodId="ews.pipeline_distance_status" side="right" />
          </span>
          <span className="inline-flex items-center">
            CPA/TCPA <MethodInfo methodId="collision.cpa_tcpa" side="right" />
          </span>
        </div>
      )}
    </div>
  );
}
