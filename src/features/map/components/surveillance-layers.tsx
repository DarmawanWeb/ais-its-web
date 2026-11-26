import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { PickingInfo } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { alertTypeLabel } from '@darmawanweb/ais-its-contracts/domain';
import { keepPreviousData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeatmapCellDto } from '@/shared/api/generated/surveillance/model';
import { useEventsControllerList as useSurveillanceEvents } from '@/shared/api/generated/surveillance/events/events';
import { useStatisticsControllerHeatmap } from '@/shared/api/generated/surveillance/statistics/statistics';
import { usePermission } from '@/shared/auth/hooks';
import { useDeckLayers, useMapViewport, type MapTooltip } from '@/shared/map';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { useNow } from '@/shared/hooks/use-now';
import {
  eventMarkers,
  HEATMAP_COLORS,
  heatmapCellKm,
  snappedBbox,
  type EventMarker,
} from '../lib/surveillance';
import { MAP_FONT } from '@/shared/map/constants';

/** Latest surveillance events of the viewport (last 24 h), one marker + letter per type. */
export function SurveillanceEventsLayer() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const canRead = usePermission('surveillance:read');
  const visible = useLiveMapStore((state) => state.layers.has('events'));
  const types = useLiveMapStore((state) => state.eventTypes);
  const viewport = useMapViewport({ debounceMs: 400 });
  const now = useNow(5 * 60_000);
  const bbox = useMemo(
    () => snappedBbox(viewport.bbox, viewport.zoom),
    [viewport.bbox, viewport.zoom],
  );
  const query = useSurveillanceEvents(
    { bbox, from: new Date(now - 24 * 3_600_000).toISOString(), limit: 500 },
    {
      query: {
        enabled: canRead && visible,
        staleTime: 60_000,
        refetchInterval: 120_000,
        placeholderData: keepPreviousData,
      },
    },
  );
  const events = useMemo(() => eventMarkers(query.data?.data ?? [], types), [query.data, types]);
  const layers = useMemo(() => {
    if (!visible || events.length === 0) return null;
    return [
      new ScatterplotLayer<EventMarker>({
        id: 'surveillance-events',
        data: events,
        getPosition: (d) => d.position,
        radiusUnits: 'pixels',
        getRadius: 9,
        filled: true,
        getFillColor: (d) => d.style.color,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (d) => (d.event.status === 'open' ? 2.5 : 1),
        getLineColor: [255, 255, 255, 235],
        pickable: true,
      }),
      new TextLayer<EventMarker>({
        id: 'surveillance-events-letter',
        data: events,
        getPosition: (d) => d.position,
        getText: (d) => d.style.letter,
        getSize: 11,
        getColor: [7, 13, 23, 255],
        fontWeight: 800,
        characterSet: 'auto',
        fontFamily: MAP_FONT,
      }),
    ];
  }, [visible, events]);
  const getTooltip = useCallback(
    (info: PickingInfo): MapTooltip => {
      const marker = info.object as EventMarker | undefined;
      if (!marker?.event) return null;
      const name =
        typeof marker.event.vesselName === 'string' ? marker.event.vesselName : marker.event.mmsi;
      return {
        text: `${alertTypeLabel(marker.event.type, locale)} · ${name}\n${marker.event.title}`,
        className: 'deck-tooltip',
      };
    },
    [locale],
  );
  useDeckLayers('surveillance-events', layers, { order: 60, getTooltip });
  return null;
}

/** Fishing activity heatmap (`GET /surveillance/heatmap?type=fishing`, last 30 days). */
export function FishingHeatmapLayer() {
  const canRead = usePermission('surveillance:read');
  const visible = useLiveMapStore((state) => state.layers.has('heatmap'));
  const viewport = useMapViewport({ debounceMs: 500 });
  const now = useNow(60 * 60_000);
  const bbox = useMemo(
    () => snappedBbox(viewport.bbox, viewport.zoom),
    [viewport.bbox, viewport.zoom],
  );
  const cellKm = heatmapCellKm(viewport.zoom);
  const query = useStatisticsControllerHeatmap(
    { type: 'fishing', bbox, cellKm, from: new Date(now - 30 * 24 * 3_600_000).toISOString() },
    {
      query: {
        enabled: canRead && visible,
        staleTime: 5 * 60_000,
        placeholderData: keepPreviousData,
      },
    },
  );
  const cells = query.data?.cells;
  const layers = useMemo(
    () =>
      visible && cells?.length
        ? new HeatmapLayer<HeatmapCellDto>({
            id: 'fishing-heatmap',
            data: cells,
            getPosition: (d) => [d.lon, d.lat],
            getWeight: (d) => d.count,
            radiusPixels: 42,
            intensity: 1.2,
            threshold: 0.04,
            colorRange: HEATMAP_COLORS,
            aggregation: 'SUM',
          })
        : null,
    [visible, cells],
  );
  useDeckLayers('fishing-heatmap', layers, { order: 5 });
  return null;
}
