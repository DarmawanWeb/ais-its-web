import { useTranslation } from 'react-i18next';

import { MapView, useMapViewport, VesselLayer } from '@/shared/map';
import { useViewportPositions } from '@/shared/realtime';

function LiveVessels() {
  const viewport = useMapViewport();
  const { vessels } = useViewportPositions(viewport.bbox, viewport.zoom);
  return <VesselLayer vessels={vessels} id="dashboard-vessels" iconSize={18} />;
}

/** Compact live map of the default operating area (lazy chunk: MapLibre + deck.gl). */
export function FleetMap() {
  const { t } = useTranslation('dashboard');
  return (
    <div
      className="h-80 overflow-hidden rounded-lg border xl:h-full xl:min-h-80"
      data-testid="dashboard-map"
    >
      <MapView initialZoom={9.5} showBasemapSwitcher={false} ariaLabel={t('map.label')}>
        <LiveVessels />
      </MapView>
    </div>
  );
}
