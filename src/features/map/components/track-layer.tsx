import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { useDeckLayers } from '@/shared/map';

import { useSelectedTrack } from '../hooks/use-selected-track';
import { playedCount, positionAt } from '../lib/track';

/** The track of the selected vessel with the played part and the playback marker. */
export function TrackLayer() {
  const { track, samples } = useSelectedTrack();
  const layers = useMemo(() => {
    if (!track.enabled || samples.length < 2) return null;
    const last = samples[samples.length - 1];
    const time = track.time ?? last?.time ?? 0;
    const played = samples.slice(0, playedCount(samples, time));
    const marker = positionAt(samples, time);
    const full = [{ path: samples.map((s) => [s.lon, s.lat] as [number, number]) }];
    const done = marker
      ? [
          {
            path: [
              ...played.map((s) => [s.lon, s.lat] as [number, number]),
              [marker.lon, marker.lat] as [number, number],
            ],
          },
        ]
      : [];
    return [
      new PathLayer<(typeof full)[number]>({
        id: 'track-full',
        data: full,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 3,
        getColor: [56, 189, 248, 90],
        capRounded: true,
        jointRounded: true,
      }),
      new PathLayer<(typeof done)[number]>({
        id: 'track-played',
        data: done,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 3,
        getColor: [56, 189, 248, 255],
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'track-start',
        data: samples[0] ? [{ position: [samples[0].lon, samples[0].lat] }] : [],
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 4,
        getFillColor: [7, 13, 23, 255],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getLineColor: [56, 189, 248, 255],
      }),
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'track-marker',
        data: marker ? [{ position: [marker.lon, marker.lat] }] : [],
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 7,
        getFillColor: [56, 189, 248, 255],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2.5,
        getLineColor: [255, 255, 255, 255],
      }),
    ];
  }, [track.enabled, track.time, samples]);
  useDeckLayers('vessel-track', layers, { order: 60 });
  return null;
}
