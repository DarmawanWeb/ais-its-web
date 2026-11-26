import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { MapPageLayout, MapView } from '@/shared/map';
import { realtime } from '@/shared/realtime/client';

import { EncountersLayer } from '../components/encounters-layer';
import { LiveVesselLayer } from '../components/live-vessel-layer';
import { MapControls } from '../components/map-controls';
import { MapHoverTooltip } from '../components/map-hover-tooltip';
import { MapSearch } from '../components/map-search';
import { MapLegendPanel, MapStatusBar } from '../components/map-status';
import { MapSync } from '../components/map-sync';
import { FishingHeatmapLayer, SurveillanceEventsLayer } from '../components/surveillance-layers';
import { TrackLayer } from '../components/track-layer';
import { VesselPanel } from '../components/vessel-panel';
import { ZonesLayer } from '../components/zones-layer';
import { useLiveMapStore } from '../hooks/use-live-map-store';
import { parseMapUrl } from '../lib/url-state';

/**
 * Live map (spec §14): realtime vessels by safety state over zones, pipelines, collision
 * encounters, surveillance events and the fishing heatmap; search, filters, legend, vessel panel
 * with track playback; the view, the selected vessel and the layers live in the URL.
 */
export function LiveMapPage() {
  const { t } = useTranslation('map');
  const [searchParams] = useSearchParams();
  // The URL is read once: the page owns the state afterwards and writes it back (MapSync).
  const [initial] = useState(() => {
    const parsed = parseMapUrl(searchParams);
    useLiveMapStore.getState().initFromUrl(parsed);
    return parsed;
  });
  const selectedMmsi = useLiveMapStore((state) => state.selectedMmsi);
  const select = useLiveMapStore((state) => state.select);
  const selectedName =
    selectedMmsi === null ? null : (realtime.vessels.get(selectedMmsi)?.vessel?.name ?? null);

  return (
    <MapPageLayout
      title={t('title')}
      map={
        <MapView
          ariaLabel={t('mapLabel')}
          {...(initial.center ? { initialCenter: initial.center } : {})}
          {...(initial.zoom !== null ? { initialZoom: initial.zoom } : {})}
        >
          <FishingHeatmapLayer />
          <ZonesLayer />
          <EncountersLayer />
          <SurveillanceEventsLayer />
          <TrackLayer />
          <LiveVesselLayer />
          <MapHoverTooltip />
          <MapSync followSelection={!initial.center && initial.vessel !== null} />
          <div className="pointer-events-none absolute top-3 right-14 z-10 hidden justify-end *:pointer-events-auto md:flex md:max-w-[calc(100%-26rem)]">
            <MapStatusBar />
          </div>
        </MapView>
      }
      topLeft={
        <>
          <MapSearch />
          <div className="md:hidden">
            <MapStatusBar compact />
          </div>
          <MapControls />
        </>
      }
      bottomLeft={<MapLegendPanel />}
      sidePanel={
        selectedMmsi !== null ? <VesselPanel key={selectedMmsi} mmsi={selectedMmsi} /> : null
      }
      sidePanelTitle={selectedName ?? t('vessel.title')}
      sidePanelOpen={selectedMmsi !== null}
      onSidePanelOpenChange={(open) => {
        if (!open) select(null);
      }}
    />
  );
}
