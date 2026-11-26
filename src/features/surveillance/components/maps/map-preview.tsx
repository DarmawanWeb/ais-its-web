import { MapPinOff } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { MapLegend, MapView, type LegendItem } from '@/shared/map';
import { cn } from '@/shared/lib/utils';

import type { LonLat } from '../../lib/geo';
import { useSeverityLegend } from '../../hooks/use-severity-legend';
import { EventPointsLayer, FitToPoints, type MapPoint } from './layers';

/**
 * Map preview of a surveillance list: events as markers (colour and size by severity, filled
 * while open), optional context layers (`children`), legend and a hint when nothing on the
 * current page has a position. Fits the view when `fitKey` changes.
 */
export function MapPreview({
  points,
  selectedId,
  onSelect,
  fitKey,
  extraFitPoints,
  legend,
  children,
  className,
  ariaLabel,
  emptyHint,
}: {
  points: readonly MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  fitKey: string;
  extraFitPoints?: readonly LonLat[];
  legend?: readonly LegendItem[];
  children?: ReactNode;
  className?: string;
  ariaLabel: string;
  emptyHint?: ReactNode;
}) {
  const { t } = useTranslation('surveillance');
  const severityLegend = useSeverityLegend();
  const wide = useMediaQuery('(min-width: 640px)');
  const fitPoints = useMemo<LonLat[]>(
    () => [...points.map((point): LonLat => [point.lon, point.lat]), ...(extraFitPoints ?? [])],
    [points, extraFitPoints],
  );
  return (
    <div
      className={cn(
        'relative isolate h-72 overflow-hidden rounded-xl border bg-surface shadow-xs sm:h-80 2xl:h-[28rem]',
        className,
      )}
    >
      <MapView ariaLabel={ariaLabel} showScale>
        <EventPointsLayer points={points} selectedId={selectedId} onSelect={onSelect} />
        <FitToPoints points={fitPoints} fitKey={fitKey} />
        {children}
      </MapView>
      <div className="pointer-events-none absolute bottom-9 left-3 z-10 *:pointer-events-auto">
        <MapLegend
          title={t('map.legend.title')}
          items={legend ?? severityLegend}
          defaultOpen={wide}
        />
      </div>
      {points.length === 0 && emptyHint !== null && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
          <p className="glass-panel flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-muted-foreground shadow-panel">
            <MapPinOff className="size-3.5" aria-hidden />
            {emptyHint ?? t('map.noPositions')}
          </p>
        </div>
      )}
    </div>
  );
}
