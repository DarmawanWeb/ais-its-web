import type { PickingInfo } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useEffect, useMemo, useRef } from 'react';

import type { ZoneFeatureCollectionDto, ZoneFeatureDto } from '@/shared/api/generated/geo/model';
import { useDeckLayers, useMapContext, type MapTooltip } from '@/shared/map';
import { SAFETY_COLORS } from '@/shared/theme/tokens';

import type { SimpleGeometry } from '../../lib/draw-geometry';
import { kindColor } from '../../lib/kind-style';

function zoneTooltip(info: PickingInfo): MapTooltip {
  const feature = info.object as ZoneFeatureDto | undefined;
  if (!feature?.properties) return null;
  const { name, code, bufferM } = feature.properties;
  return {
    text: `${name}\n${code}${bufferM > 0 ? ` · buffer ${bufferM} m` : ''}`,
    className: 'deck-tooltip',
  };
}

/**
 * Zones of `GET /zones/geojson` coloured by kind (point zones as circles of their buffer, in
 * metres); inactive zones dashed-dim, the selected zone outlined in cyan.
 */
export function ZonesLayer({
  id = 'zones',
  collection,
  selectedId,
  dim = false,
  onSelect,
}: {
  id?: string;
  collection: ZoneFeatureCollectionDto | undefined;
  selectedId?: string | null;
  dim?: boolean;
  onSelect?: (id: string) => void;
}) {
  const layers = useMemo(() => {
    if (!collection || collection.features.length === 0) return null;
    const data = collection as unknown as GeoJSON.FeatureCollection;
    const props = (feature: unknown) => (feature as ZoneFeatureDto).properties;
    const selected = collection.features.filter((feature) => feature.id === selectedId);
    return [
      new GeoJsonLayer({
        id,
        data,
        stroked: true,
        filled: true,
        pointType: 'circle',
        getPointRadius: (feature) => Math.max(120, props(feature).bufferM || 0),
        pointRadiusUnits: 'meters',
        getFillColor: (feature) =>
          kindColor(props(feature).kind, dim ? 18 : props(feature).active ? 46 : 16),
        getLineColor: (feature) =>
          kindColor(props(feature).kind, dim ? 90 : props(feature).active ? 220 : 110),
        lineWidthUnits: 'pixels',
        getLineWidth: (feature) =>
          props(feature).kind === 'pipeline' || props(feature).kind === 'tss_lane' ? 3 : 1.5,
        pickable: !dim,
        autoHighlight: !dim,
        highlightColor: [255, 255, 255, 50],
        onClick: (info) => {
          const feature = info.object as ZoneFeatureDto | undefined;
          if (feature) onSelect?.(feature.id);
        },
        updateTriggers: { getFillColor: [dim], getLineColor: [dim] },
      }),
      selected.length > 0 &&
        new GeoJsonLayer({
          id: `${id}-selected`,
          data: {
            type: 'FeatureCollection',
            features: selected,
          } as unknown as GeoJSON.FeatureCollection,
          stroked: true,
          filled: false,
          pointType: 'circle',
          getPointRadius: (feature) => Math.max(120, props(feature).bufferM || 0),
          pointRadiusUnits: 'meters',
          getLineColor: SAFETY_COLORS.selected,
          lineWidthUnits: 'pixels',
          getLineWidth: 3,
        }),
    ];
  }, [id, collection, selectedId, dim, onSelect]);
  useDeckLayers(id, layers, { order: 10, getTooltip: dim ? undefined : zoneTooltip });
  return null;
}

/**
 * Buffer of the drawn geometry (`bufferM` metres): circles around points, corridors along lines
 * and polygon edges — the area of effect the detectors use.
 */
export function BufferPreviewLayer({
  parts,
  bufferM,
}: {
  parts: readonly SimpleGeometry[];
  bufferM: number;
}) {
  const layers = useMemo(() => {
    if (!(bufferM > 0) || parts.length === 0) return null;
    const points = parts
      .filter((part) => part.type === 'Point')
      .map((part) => part.coordinates as [number, number]);
    const paths = parts.flatMap((part) =>
      part.type === 'LineString'
        ? [part.coordinates as [number, number][]]
        : part.type === 'Polygon'
          ? (part.coordinates as [number, number][][])
          : [],
    );
    return [
      new PathLayer<[number, number][]>({
        id: 'zone-buffer-paths',
        data: paths,
        getPath: (path) => path,
        widthUnits: 'meters',
        getWidth: bufferM * 2,
        getColor: [34, 211, 238, 45],
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<[number, number]>({
        id: 'zone-buffer-points',
        data: points,
        getPosition: (point) => point,
        radiusUnits: 'meters',
        getRadius: bufferM,
        stroked: true,
        filled: true,
        getFillColor: [34, 211, 238, 40],
        getLineColor: [34, 211, 238, 200],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
      }),
    ];
  }, [parts, bufferM]);
  useDeckLayers('zone-buffer', layers, { order: 9 });
  return null;
}

/** Fits the map to a bbox once per `fitKey`. */
export function FitToBBox({
  bbox,
  fitKey,
  maxZoom = 12,
}: {
  bbox: readonly number[] | null | undefined;
  fitKey: string;
  maxZoom?: number;
}) {
  const { map } = useMapContext();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!bbox || bbox.length !== 4 || fitted.current === fitKey) return;
    fitted.current = fitKey;
    const [minLon = 0, minLat = 0, maxLon = 0, maxLat = 0] = bbox;
    const pad = Math.max(0.01, Math.max(maxLon - minLon, maxLat - minLat) * 0.08);
    map.fitBounds(
      [
        [minLon - pad, minLat - pad],
        [maxLon + pad, maxLat + pad],
      ],
      { padding: 32, maxZoom, duration: 0 },
    );
  }, [map, bbox, fitKey, maxZoom]);
  return null;
}
