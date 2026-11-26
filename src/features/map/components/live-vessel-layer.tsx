import { AIS_SOURCES } from '@darmawanweb/ais-its-contracts/domain';
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useDeckLayers, useMapContext, useMapViewport } from '@/shared/map';
import { useVesselIconAtlas } from '@/shared/map/vessel-icons';
import { realtime } from '@/shared/realtime/client';
import { useViewportPositions } from '@/shared/realtime/hooks';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { filterVessels, vesselStats } from '../lib/vessel-filters';
import {
  buildVesselBuffers,
  clusterVessels,
  createVesselLayers,
  vesselLod,
  type VesselCluster,
} from '../lib/vessel-layers';

/**
 * Live vessels of the viewport (inside <MapView>): REST seed + realtime tile rooms (spec §9) →
 * normalized store → throttled snapshot → filters → typed-array buffers → deck.gl layers at the
 * zoom's level of detail. Publishes the counts for the status bar.
 */
export function LiveVesselLayer() {
  const { map } = useMapContext();
  const viewport = useMapViewport();
  const { vessels } = useViewportPositions(viewport.bbox, viewport.zoom);
  const { layers, sources, categories, navstatus, safety, selectedMmsi } = useLiveMapStore(
    useShallow((state) => ({
      layers: state.layers,
      sources: state.sources,
      categories: state.categories,
      navstatus: state.navstatus,
      safety: state.safety,
      selectedMmsi: state.selectedMmsi,
    })),
  );
  const select = useLiveMapStore((state) => state.select);
  const setHover = useLiveMapStore((state) => state.setHover);
  const setStats = useLiveMapStore((state) => state.setStats);
  const visible = layers.has('vessels');

  const filtered = useMemo(
    () =>
      filterVessels(vessels, {
        categories,
        navstatus,
        safety,
        sources: sources.size === AIS_SOURCES.length ? null : sources,
      }),
    [vessels, categories, navstatus, safety, sources],
  );
  const zoom = viewport.zoom;
  const lod = vesselLod(zoom, filtered.length);
  const buffers = useMemo(() => buildVesselBuffers(filtered), [filtered]);
  const clusters = useMemo(
    () => (lod === 'cluster' ? clusterVessels(filtered, zoom) : null),
    [filtered, lod, zoom],
  );
  const atlas = useVesselIconAtlas().data ?? null;
  const selected: VesselLiveRecord | null =
    selectedMmsi === null ? null : (realtime.vessels.get(selectedMmsi) ?? null);

  useEffect(() => {
    setStats(visible ? vesselStats(filtered) : vesselStats([]), vessels.length, zoom);
  }, [filtered, vessels.length, zoom, visible, setStats]);

  const onSelect = useCallback((record: VesselLiveRecord) => select(record.mmsi), [select]);
  const onHover = useCallback(
    (record: VesselLiveRecord | null, x: number, y: number) =>
      setHover(record ? { kind: 'vessel', mmsi: record.mmsi, x, y } : null),
    [setHover],
  );
  const onClusterClick = useCallback(
    (cluster: VesselCluster) =>
      map.easeTo({
        center: cluster.position,
        zoom: Math.min(map.getZoom() + 2.5, 12),
        duration: 600,
      }),
    [map],
  );

  const deckLayers = useMemo(
    () =>
      visible
        ? createVesselLayers(buffers, clusters, {
            lod,
            zoom,
            atlas,
            selected,
            onSelect,
            onHover,
            onClusterClick,
          })
        : null,
    [visible, buffers, clusters, lod, zoom, atlas, selected, onSelect, onHover, onClusterClick],
  );
  useDeckLayers('live-vessels', deckLayers, { order: 100 });
  return null;
}
