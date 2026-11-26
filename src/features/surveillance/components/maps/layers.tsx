import type { PickingInfo } from '@deck.gl/core';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useEffect, useMemo, useRef } from 'react';

import type { ZoneFeatureCollectionDto, ZoneFeatureDto } from '@/shared/api/generated/geo/model';
import type { HeatmapCellDto } from '@/shared/api/generated/surveillance/model';
import { useDeckLayers, useMapContext, type MapTooltip } from '@/shared/map';
import { useResolvedTheme } from '@/shared/theme/theme';
import { SAFETY_COLORS, type Rgba } from '@/shared/theme/tokens';

import { bboxOf, type LonLat } from '../../lib/geo';
import { HEAT_RANGES } from '../../lib/heat';
import { severityColor } from '../../lib/map-style';

/** A positioned event on a preview map. */
export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  severity: string;
  /** Occurrence still open (filled) or ended by the detector (ring only). */
  active: boolean;
  label: string;
}

/** Radius (px) also encodes the severity (second channel besides colour). */
function severityRadius(severity: string): number {
  return severity === 'critical' ? 8 : severity === 'warning' ? 6.5 : 5;
}

function pointTooltip(info: PickingInfo): MapTooltip {
  const point = info.object as MapPoint | undefined;
  return point ? { text: point.label, className: 'deck-tooltip' } : null;
}

/** Event markers: filled while open, ring once resolved; the selected one gets a cyan halo. */
export function EventPointsLayer({
  id = 'surveillance-events',
  points,
  selectedId,
  onSelect,
}: {
  id?: string;
  points: readonly MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const layers = useMemo(() => {
    const selected = points.filter((point) => point.id === selectedId);
    return [
      new ScatterplotLayer<MapPoint>({
        id,
        data: [...points],
        getPosition: (point) => [point.lon, point.lat],
        radiusUnits: 'pixels',
        getRadius: (point) => severityRadius(point.severity),
        stroked: true,
        filled: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        getFillColor: (point) => {
          const [r, g, b] = severityColor(point.severity);
          return point.active ? [r, g, b, 220] : [r, g, b, 40];
        },
        getLineColor: (point) => {
          const [r, g, b] = severityColor(point.severity);
          return point.active ? [255, 255, 255, 200] : [r, g, b, 255];
        },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 60],
        onClick: (info) => {
          const point = info.object as MapPoint | undefined;
          if (point) onSelect?.(point.id);
        },
      }),
      selected.length > 0 &&
        new ScatterplotLayer<MapPoint>({
          id: `${id}-selected`,
          data: selected,
          getPosition: (point) => [point.lon, point.lat],
          radiusUnits: 'pixels',
          getRadius: (point) => severityRadius(point.severity) + 6,
          stroked: true,
          filled: false,
          lineWidthUnits: 'pixels',
          getLineWidth: 3,
          getLineColor: SAFETY_COLORS.selected,
        }),
    ];
  }, [id, points, selectedId, onSelect]);
  useDeckLayers(id, layers, { order: 60, getTooltip: pointTooltip });
  return null;
}

/** Fits the map to the given positions whenever `fitKey` changes (not on every refetch). */
export function FitToPoints({
  points,
  fitKey,
  maxZoom = 11,
  padDeg,
  minSpanDeg,
}: {
  points: readonly LonLat[];
  fitKey: string;
  maxZoom?: number;
  padDeg?: number;
  minSpanDeg?: number;
}) {
  const { map } = useMapContext();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (fitted.current === fitKey || points.length === 0) return;
    const bbox = bboxOf(points, {
      ...(padDeg !== undefined ? { padDeg } : {}),
      ...(minSpanDeg !== undefined ? { minSpanDeg } : {}),
    });
    if (!bbox) return;
    fitted.current = fitKey;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 40, maxZoom, duration: 0 },
    );
  }, [map, points, fitKey, maxZoom, padDeg, minSpanDeg]);
  return null;
}

/** Density of events from `GET /surveillance/heatmap` cells (count as weight). */
export function HeatLayer({
  id = 'surveillance-heat',
  cells,
  radiusPixels = 48,
}: {
  id?: string;
  cells: readonly HeatmapCellDto[];
  radiusPixels?: number;
}) {
  const theme = useResolvedTheme();
  const layers = useMemo(
    () =>
      cells.length === 0
        ? null
        : new HeatmapLayer<HeatmapCellDto>({
            id,
            data: [...cells],
            getPosition: (cell) => [cell.lon, cell.lat],
            getWeight: (cell) => cell.count,
            radiusPixels,
            intensity: 1.6,
            threshold: 0.03,
            colorRange: HEAT_RANGES[theme].map((color) => [...color] as Rgba),
            aggregation: 'SUM',
          }),
    [id, cells, radiusPixels, theme],
  );
  useDeckLayers(id, layers, { order: 5 });
  return null;
}

/** Points weighted equally (historical apprehensions) as a heat layer. */
export function PointHeatLayer({
  id = 'surveillance-point-heat',
  points,
}: {
  id?: string;
  points: readonly LonLat[];
}) {
  const cells = useMemo(() => points.map(([lon, lat]) => ({ lon, lat, count: 1 })), [points]);
  return <HeatLayer id={id} cells={cells} radiusPixels={56} />;
}

const ZONE_FILL: Record<string, Rgba> = {
  transhipment_area: [56, 189, 248, 34],
  fishing_ground: [52, 211, 153, 34],
  restricted: [239, 68, 68, 30],
  mpa: [45, 212, 191, 34],
  port: [167, 139, 250, 34],
  anchorage: [167, 139, 250, 34],
};

function zoneColor(feature: ZoneFeatureDto, alpha?: number): Rgba {
  const [r, g, b, a] = ZONE_FILL[feature.properties.kind] ?? [148, 163, 184, 30];
  return [r, g, b, alpha ?? a];
}

function zoneTooltip(info: PickingInfo): MapTooltip {
  const feature = info.object as ZoneFeatureDto | undefined;
  return feature?.properties ? { text: feature.properties.name, className: 'deck-tooltip' } : null;
}

/** Context zones (transhipment areas, fishing grounds, harbours) under the events. */
export function ZoneContextLayer({
  id = 'surveillance-zones',
  collection,
}: {
  id?: string;
  collection: ZoneFeatureCollectionDto | undefined;
}) {
  const layers = useMemo(
    () =>
      collection && collection.features.length > 0
        ? new GeoJsonLayer({
            id,
            // The zone DTO is a GeoJSON FeatureCollection (geometry members typed loosely).
            data: collection as unknown as GeoJSON.FeatureCollection,
            stroked: true,
            filled: true,
            pointType: 'circle',
            getPointRadius: (feature) =>
              Math.max(
                150,
                Number((feature.properties as ZoneFeatureDto['properties']).bufferM) || 0,
              ),
            pointRadiusUnits: 'meters',
            getFillColor: (feature) => zoneColor(feature as unknown as ZoneFeatureDto),
            getLineColor: (feature) => zoneColor(feature as unknown as ZoneFeatureDto, 200),
            lineWidthUnits: 'pixels',
            getLineWidth: 1.5,
            pickable: true,
          })
        : null,
    [id, collection],
  );
  useDeckLayers(id, layers, { order: 10, getTooltip: zoneTooltip });
  return null;
}

function pointsOf(feature: ZoneFeatureDto): LonLat[] {
  const { geometry } = feature;
  if (geometry.type === 'Point') return [geometry.coordinates as unknown as LonLat];
  if (geometry.type === 'MultiPoint') return geometry.coordinates as unknown as LonLat[];
  return [];
}

function verticesOf(feature: ZoneFeatureDto): LonLat[] {
  const { geometry } = feature;
  if (geometry.type === 'Polygon') return (geometry.coordinates as unknown as LonLat[][]).flat();
  if (geometry.type === 'MultiPolygon')
    return (geometry.coordinates as unknown as LonLat[][][]).flat(2);
  return [];
}

/** Circle around a polygon: centre of its box, radius to the farthest vertex (metres). */
function enclosingCircle(vertices: readonly LonLat[]): { position: LonLat; radius: number } | null {
  if (vertices.length === 0) return null;
  const lons = vertices.map(([lon]) => lon);
  const lats = vertices.map(([, lat]) => lat);
  const center: LonLat = [
    (Math.min(...lons) + Math.max(...lons)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
  const cos = Math.cos((center[1] * Math.PI) / 180);
  const radius = Math.max(
    ...vertices.map(([lon, lat]) =>
      Math.hypot((lon - center[0]) * 111_320 * cos, (lat - center[1]) * 110_574),
    ),
  );
  return { position: center, radius };
}

/**
 * The dark-vessel harbour rule drawn on the map: `bandM` metres around every harbour zone (a
 * circle of bufferM + band around point zones; around polygons the circle enclosing the polygon
 * grown by the band). A display approximation of the detector's distance test.
 */
export function HarbourBandLayer({
  id = 'surveillance-harbour-band',
  collection,
  bandM,
}: {
  id?: string;
  collection: ZoneFeatureCollectionDto | undefined;
  bandM: number;
}) {
  const layers = useMemo(() => {
    if (!collection) return null;
    const circles = collection.features.flatMap((feature) => {
      const buffer = feature.properties.bufferM || 0;
      const points = pointsOf(feature).map((position) => ({ position, radius: buffer + bandM }));
      const polygon = enclosingCircle(verticesOf(feature));
      return polygon
        ? [...points, { position: polygon.position, radius: polygon.radius + buffer + bandM }]
        : points;
    });
    return new ScatterplotLayer<{ position: LonLat; radius: number }>({
      id: `${id}-circles`,
      data: circles,
      getPosition: (circle) => circle.position,
      radiusUnits: 'meters',
      getRadius: (circle) => circle.radius,
      stroked: true,
      filled: true,
      getFillColor: [167, 139, 250, 26],
      getLineColor: [167, 139, 250, 160],
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
    });
  }, [id, collection, bandM]);
  useDeckLayers(id, layers, { order: 8 });
  return null;
}
