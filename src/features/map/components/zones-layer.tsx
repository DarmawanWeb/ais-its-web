import { keepPreviousData } from '@tanstack/react-query';
import type {
  GeoJSONSourceSpecification,
  MapMouseEvent,
  VectorSourceSpecification,
} from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useZonesControllerGeojson } from '@/shared/api/generated/geo/zones/zones';
import { usePermission, useSession } from '@/shared/auth/hooks';
import { useMapContext, useMapEvent, useMapLibreLayers, useMapViewport } from '@/shared/map';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { zoneLayers, zonesQueryArea, zonesTileUrl, ZONES_TILE_SOURCE } from '../lib/zones-style';

const GLOBAL_SOURCE = 'live-zones-global';
const ORG_SOURCE = 'live-zones-org';

/**
 * Zones of the live map (inside <MapView>):
 *  - global zones from Martin vector tiles (`/tiles/zones_tiles_mvt`, spec §12; the gateway
 *    checks the token MapLibre sends), drawn under the vessels;
 *  - the active organization's own zones from `GET /zones/geojson?orgId` (tenant-private,
 *    never in the tiles) with the map zoom for server-side simplification; a truncated answer
 *    raises the notice of the layer panel;
 *  - when the tile server fails (not deployed, 404/5xx), every visible zone comes from the
 *    GeoJSON endpoint instead (global + own organization, same simplification and budgets).
 * Pipelines (kind `pipeline`) are an emphasised layer of their own.
 */
export function ZonesLayer() {
  const { map } = useMapContext();
  const viewport = useMapViewport({ debounceMs: 400 });
  const { orgId } = useSession();
  const canRead = usePermission('zone:read');
  const showZones = useLiveMapStore((state) => state.layers.has('zones'));
  const showPipelines = useLiveMapStore((state) => state.layers.has('pipelines'));
  const setZonesTruncated = useLiveMapStore((state) => state.setZonesTruncated);
  const setHover = useLiveMapStore((state) => state.setHover);
  const any = canRead && (showZones || showPipelines);
  const [tilesFailed, setTilesFailed] = useState(false);
  useMapEvent('error', (event) => {
    if ((event as { sourceId?: string }).sourceId === GLOBAL_SOURCE) setTilesFailed(true);
  });

  const vectorSource = useMemo<VectorSourceSpecification>(
    () => ({ type: 'vector', tiles: [zonesTileUrl()], minzoom: 0, maxzoom: 14 }),
    [],
  );
  const globalLayers = useMemo(
    () =>
      zoneLayers({
        source: GLOBAL_SOURCE,
        sourceLayer: ZONES_TILE_SOURCE,
        showZones,
        showPipelines,
      }),
    [showZones, showPipelines],
  );
  useMapLibreLayers(GLOBAL_SOURCE, any && !tilesFailed ? vectorSource : null, globalLayers);

  const area = useMemo(
    () => zonesQueryArea(viewport.bbox, viewport.zoom),
    [viewport.bbox, viewport.zoom],
  );
  const org = useZonesControllerGeojson(
    { ...(orgId && !tilesFailed ? { orgId } : {}), bbox: area.bbox, zoom: area.zoom },
    {
      query: {
        enabled: any && (tilesFailed || !!orgId),
        staleTime: 60_000,
        placeholderData: keepPreviousData,
      },
    },
  );
  const orgSource = useMemo<GeoJSONSourceSpecification | null>(
    () =>
      org.data ? { type: 'geojson', data: org.data as unknown as GeoJSON.FeatureCollection } : null,
    [org.data],
  );
  const orgLayers = useMemo(
    () => zoneLayers({ source: ORG_SOURCE, showZones, showPipelines, dashed: true }),
    [showZones, showPipelines],
  );
  useMapLibreLayers(ORG_SOURCE, any ? orgSource : null, orgLayers);

  useEffect(
    () => setZonesTruncated(any && !!org.data?.truncated),
    [any, org.data?.truncated, setZonesTruncated],
  );

  // Zone under the pointer (when no vessel is hovered), throttled to one query per frame.
  const pending = useRef<number | null>(null);
  const layerIds = useMemo(
    () => [...globalLayers, ...orgLayers].map((layer) => layer.id),
    [globalLayers, orgLayers],
  );
  useMapEvent('mousemove', (event: MapMouseEvent) => {
    if (pending.current !== null) return;
    const { x, y } = event.point;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      const current = useLiveMapStore.getState().hover;
      if (current?.kind === 'vessel') return;
      const present = layerIds.filter((id) => map.getLayer(id));
      const feature = present.length
        ? map.queryRenderedFeatures([x, y], { layers: present })[0]
        : undefined;
      const props = feature?.properties as
        { name?: string; kind?: string; global?: boolean } | undefined;
      if (props?.name) {
        setHover({
          kind: 'zone',
          name: String(props.name),
          zoneKind: String(props.kind ?? 'custom'),
          global: feature?.source === GLOBAL_SOURCE || props.global === true,
          x,
          y,
        });
      } else if (current?.kind === 'zone') setHover(null);
    });
  });
  useMapEvent('mouseout', () => {
    if (useLiveMapStore.getState().hover?.kind === 'zone') setHover(null);
  });
  useEffect(
    () => () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
    },
    [],
  );
  return null;
}
