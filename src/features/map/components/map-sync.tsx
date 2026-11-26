import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { useMapContext, useMapViewport } from '@/shared/map';
import { useVesselLive } from '@/shared/realtime/hooks';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { writeMapUrl } from '../lib/url-state';

/**
 * Keeps the URL in step with the map (inside <MapView>): centre and zoom after each move,
 * selected vessel and layers when they change (`replace`, so the history is not flooded).
 * Executes fly-to requests of the panels and flies to a vessel opened from a link once its
 * position is known.
 */
export function MapSync({ followSelection }: { followSelection: boolean }) {
  const { map } = useMapContext();
  const viewport = useMapViewport({ debounceMs: 350 });
  const [, setSearchParams] = useSearchParams();
  const layers = useLiveMapStore((state) => state.layers);
  const sources = useLiveMapStore((state) => state.sources);
  const selectedMmsi = useLiveMapStore((state) => state.selectedMmsi);
  const flyTo = useLiveMapStore((state) => state.flyTo);
  const mounted = useRef(false);

  useEffect(() => {
    // The first viewport is the initial view: write it only after the user moved the map.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSearchParams(
      (current) => writeMapUrl({ center: viewport.center, zoom: viewport.zoom }, current),
      {
        replace: true,
      },
    );
  }, [viewport.center, viewport.zoom, setSearchParams]);

  useEffect(() => {
    setSearchParams(
      (current) =>
        writeMapUrl({ vessel: selectedMmsi, layers: [...layers], sources: [...sources] }, current),
      { replace: true },
    );
  }, [selectedMmsi, layers, sources, setSearchParams]);

  const flyToId = flyTo?.id;
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo({
      center: flyTo.center,
      zoom: flyTo.zoom ?? Math.max(map.getZoom(), 12),
      speed: 1.6,
      essential: true,
    });
    // only when a new request arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToId, map]);

  // A vessel from a shared link without a map position in it: fly there once it is known.
  const live = useVesselLive(followSelection ? selectedMmsi : null);
  const followed = useRef<number | null>(null);
  useEffect(() => {
    if (!followSelection || !live || followed.current === live.mmsi) return;
    followed.current = live.mmsi;
    map.flyTo({ center: [live.lon, live.lat], zoom: Math.max(map.getZoom(), 12), speed: 1.6 });
  }, [followSelection, live, map]);

  return null;
}
