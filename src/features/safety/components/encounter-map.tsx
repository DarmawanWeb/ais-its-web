import type { PickingInfo } from '@deck.gl/core';
import { LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { usePositionsControllerPairTrack } from '@/shared/api/generated/ais-processor/ais/ais';
import type { EncounterDto, EncounterSampleDto } from '@/shared/api/generated/safety/model';
import { MapLegend, MapView, useDeckLayers, useMapContext, type MapTooltip } from '@/shared/map';
import { rgbaToCss, type Rgba } from '@/shared/theme/tokens';

import { riskColor, VESSEL_A_COLOR, VESSEL_B_COLOR, withAlpha } from '../lib/colors';
import { closestSample, pairTrackWindow } from '../lib/encounters';
import { MAP_FONT } from '@/shared/map/constants';

interface TrackPath {
  key: 'a' | 'b';
  mmsi: number;
  path: [number, number][];
  color: Rgba;
}

interface SamplePoint {
  position: [number, number];
  risk: string;
  sample: EncounterSampleDto;
  vessel: 'a' | 'b';
}

function boundsOf(
  paths: readonly [number, number][][],
): [[number, number], [number, number]] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const path of paths) {
    for (const [lon, lat] of path) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}

function EncounterLayers({
  tracks,
  samples,
  closest,
  cpaLabel,
}: {
  tracks: TrackPath[];
  samples: SamplePoint[];
  closest: EncounterSampleDto | null;
  cpaLabel: string;
}) {
  const { map } = useMapContext();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const bounds = boundsOf(tracks.map((track) => track.path));
    if (!bounds) return;
    fitted.current = true;
    map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
  }, [tracks, map]);

  const layers = useMemo(() => {
    const ends = tracks.flatMap((track) => {
      const last = track.path.at(-1);
      return last ? [{ ...track, position: last }] : [];
    });
    const closestLine = closest
      ? [
          {
            source: [closest.positions.a.lon, closest.positions.a.lat] as [number, number],
            target: [closest.positions.b.lon, closest.positions.b.lat] as [number, number],
            risk: closest.risk,
          },
        ]
      : [];
    return [
      new PathLayer<TrackPath>({
        id: 'encounter-track-casing',
        data: tracks,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 5,
        getColor: [7, 13, 23, 140],
        capRounded: true,
        jointRounded: true,
      }),
      new PathLayer<TrackPath>({
        id: 'encounter-track',
        data: tracks,
        getPath: (d) => d.path,
        widthUnits: 'pixels',
        getWidth: 2.5,
        getColor: (d) => d.color,
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<SamplePoint>({
        id: 'encounter-samples',
        data: samples,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 3.5,
        getFillColor: (d) => riskColor(d.risk),
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        getLineColor: [7, 13, 23, 220],
        pickable: true,
      }),
      new LineLayer<(typeof closestLine)[number]>({
        id: 'encounter-closest',
        data: closestLine,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: (d) => riskColor(d.risk),
        getWidth: 3,
        widthUnits: 'pixels',
      }),
      new ScatterplotLayer<(typeof closestLine)[number]>({
        id: 'encounter-closest-ends',
        data: closestLine.flatMap((line) => [
          { ...line, source: line.source },
          { ...line, source: line.target },
        ]),
        getPosition: (d) => d.source,
        radiusUnits: 'pixels',
        getRadius: 7,
        filled: true,
        getFillColor: (d) => withAlpha(riskColor(d.risk), 60),
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getLineColor: (d) => riskColor(d.risk),
      }),
      new TextLayer<(typeof closestLine)[number]>({
        id: 'encounter-closest-label',
        data: closestLine,
        getPosition: (d) => [(d.source[0] + d.target[0]) / 2, (d.source[1] + d.target[1]) / 2],
        getText: () => cpaLabel,
        getSize: 12,
        getPixelOffset: [0, -16],
        getColor: [241, 245, 249, 255],
        outlineWidth: 3,
        outlineColor: [7, 13, 23, 230],
        fontSettings: { sdf: true },
        fontWeight: 600,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
      }),
      new ScatterplotLayer<(typeof ends)[number]>({
        id: 'encounter-ends',
        data: ends,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 9,
        getFillColor: (d) => d.color,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getLineColor: [255, 255, 255, 255],
      }),
      new TextLayer<(typeof ends)[number]>({
        id: 'encounter-ends-label',
        data: ends,
        getPosition: (d) => d.position,
        getText: (d) => d.key.toUpperCase(),
        getSize: 11,
        getColor: [7, 13, 23, 255],
        fontWeight: 700,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
      }),
    ];
  }, [tracks, samples, closest, cpaLabel]);

  const { i18n } = useTranslation();
  const getTooltip = useCallback(
    (info: PickingInfo): MapTooltip => {
      const point = info.object as SamplePoint | undefined;
      if (!point?.sample) return null;
      const format = new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'id-ID', {
        maximumFractionDigits: 2,
      });
      const time = new Date(point.sample.time).toLocaleTimeString(
        i18n.language === 'en' ? 'en-GB' : 'id-ID',
      );
      return {
        text: `${time}\nCPA ${format.format(point.sample.cpaNm)} nm · TCPA ${
          point.sample.tcpaMin === null ? '—' : format.format(point.sample.tcpaMin)
        } min`,
        className: 'deck-tooltip',
      };
    },
    [i18n.language],
  );
  useDeckLayers('encounter', layers, { order: 50, getTooltip });
  return null;
}

/** Map of both vessels' tracks around an encounter (ais-processor pair track) with the CPA. */
export function EncounterMap({
  encounter,
  className,
}: {
  encounter: EncounterDto;
  className?: string;
}) {
  const { t, i18n } = useTranslation('safety');
  const span = useMemo(() => pairTrackWindow(encounter), [encounter]);
  const pair = usePositionsControllerPairTrack(
    { mmsi1: encounter.mmsiA, mmsi2: encounter.mmsiB, from: span.from, to: span.to },
    { query: { staleTime: 60_000 } },
  );
  const closest = useMemo(() => closestSample(encounter), [encounter]);

  const tracks = useMemo<TrackPath[]>(() => {
    const ordered = [...(pair.data?.tracks ?? [])].sort(
      // The API answers [mmsi1, mmsi2]; keep vessel A = mmsiA (the lower MMSI).
      (x, y) => (x.mmsi === encounter.mmsiA ? -1 : y.mmsi === encounter.mmsiA ? 1 : 0),
    );
    const keys: TrackPath['key'][] = ['a', 'b'];
    const fromApi: TrackPath[] = ordered.slice(0, 2).map((track, index) => ({
      key: keys[index] ?? 'b',
      mmsi: track.mmsi,
      color: index === 0 ? VESSEL_A_COLOR : VESSEL_B_COLOR,
      path: track.points.map((point): [number, number] => [point.lon, point.lat]),
    }));
    if (fromApi.length === 2 && fromApi.every((track) => track.path.length >= 2)) return fromApi;
    // Fallback: the positions recorded with the encounter samples.
    return [
      {
        key: 'a',
        mmsi: encounter.mmsiA,
        color: VESSEL_A_COLOR,
        path: encounter.history.map((s): [number, number] => [
          s.positions.a.lon,
          s.positions.a.lat,
        ]),
      },
      {
        key: 'b',
        mmsi: encounter.mmsiB,
        color: VESSEL_B_COLOR,
        path: encounter.history.map((s): [number, number] => [
          s.positions.b.lon,
          s.positions.b.lat,
        ]),
      },
    ];
  }, [pair.data, encounter]);

  const samples = useMemo<SamplePoint[]>(
    () =>
      encounter.history.flatMap((sample) => [
        {
          position: [sample.positions.a.lon, sample.positions.a.lat],
          risk: sample.risk,
          sample,
          vessel: 'a' as const,
        },
        {
          position: [sample.positions.b.lon, sample.positions.b.lat],
          risk: sample.risk,
          sample,
          vessel: 'b' as const,
        },
      ]),
    [encounter.history],
  );
  const cpaLabel = closest
    ? `CPA ${new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'id-ID', { maximumFractionDigits: 2 }).format(closest.cpaNm)} nm`
    : '';

  return (
    <div className={className} data-testid="encounter-map">
      <MapView ariaLabel={t('collision.detail.mapLabel')} showBasemapSwitcher={false} showScale>
        <EncounterLayers tracks={tracks} samples={samples} closest={closest} cpaLabel={cpaLabel} />
        <div className="pointer-events-none absolute top-2 left-2 z-10 *:pointer-events-auto">
          <MapLegend
            defaultOpen={false}
            className="w-48"
            items={[
              { label: `A · ${encounter.mmsiA}`, color: rgbaToCss(VESSEL_A_COLOR), shape: 'line' },
              { label: `B · ${encounter.mmsiB}`, color: rgbaToCss(VESSEL_B_COLOR), shape: 'line' },
              {
                label: t('collision.detail.closestLine'),
                color: rgbaToCss(riskColor(closest?.risk ?? 'high')),
                shape: 'line',
              },
              {
                label: t('collision.detail.samples'),
                color: rgbaToCss(riskColor('medium')),
                shape: 'dot',
              },
            ]}
          />
          {pair.isError && (
            <p className="glass-panel mt-1.5 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
              {t('collision.detail.trackFallback')}
            </p>
          )}
        </div>
      </MapView>
    </div>
  );
}
