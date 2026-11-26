import { useMemo } from 'react';

import { usePositionsControllerTrack } from '@/shared/api/generated/ais-processor/ais/ais';

import { trackParams, trackSamples } from '../lib/track';
import { useLiveMapStore } from './use-live-map-store';

/** Track query of the selected vessel (shared by the layer and the panel: same key). */
export function useSelectedTrack() {
  const mmsi = useLiveMapStore((state) => state.selectedMmsi);
  const track = useLiveMapStore((state) => state.track);
  const params = useMemo(() => trackParams(track.range, track.anchor), [track.range, track.anchor]);
  const query = usePositionsControllerTrack(String(mmsi ?? 0), params, {
    query: { enabled: mmsi !== null && track.enabled, staleTime: 60_000 },
  });
  const samples = useMemo(() => trackSamples(query.data?.points ?? []), [query.data]);
  return { mmsi, track, query, samples };
}
