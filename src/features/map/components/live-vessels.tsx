import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';
import { MapPanel, useMapViewport, VesselLayer } from '@/shared/map';
import { useViewportPositions } from '@/shared/realtime/hooks';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import { cn } from '@/shared/lib/utils';

/**
 * Live vessels of the visible area (inside <MapView>): viewport → realtime tile rooms →
 * normalized store → throttled deck.gl layer. The canonical example of the map APIs.
 */
export function LiveVessels({
  selectedMmsi,
  onSelect,
}: {
  selectedMmsi: number | null;
  onSelect: (record: VesselLiveRecord) => void;
}) {
  const { t, i18n } = useTranslation('map');
  const viewport = useMapViewport();
  const { vessels, status } = useViewportPositions(viewport.bbox, viewport.zoom);
  return (
    <>
      <VesselLayer vessels={vessels} selectedMmsi={selectedMmsi} onSelect={onSelect} />
      <div className="absolute top-3 left-3 z-10 w-[min(18rem,calc(100%-4.5rem))]">
        <MapPanel title={t('panel.title')}>
          <p className="text-xs text-muted-foreground">{t('panel.subtitle')}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <dt className="text-[10px] text-muted-foreground uppercase">{t('panel.vessels')}</dt>
              <dd
                className="font-mono text-base font-semibold tabular-nums"
                data-testid="vessel-count"
              >
                {formatNumber(vessels.length, i18n.language)}
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <dt className="text-[10px] text-muted-foreground uppercase">{t('panel.zoom')}</dt>
              <dd className="font-mono text-base font-semibold tabular-nums">
                {viewport.zoom.toFixed(1)}
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <dt className="text-[10px] text-muted-foreground uppercase">
                {t('panel.connection')}
              </dt>
              <dd className="flex h-6 items-center justify-center">
                <span
                  className={cn(
                    'size-2.5 rounded-full',
                    status === 'connected'
                      ? 'bg-success'
                      : status === 'error'
                        ? 'bg-danger'
                        : 'bg-warning',
                  )}
                  title={t(`common:shell.realtime.${status}`)}
                />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">{t('panel.hint')}</p>
        </MapPanel>
      </div>
    </>
  );
}
