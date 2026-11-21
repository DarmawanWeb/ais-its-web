import 'maplibre-gl/dist/maplibre-gl.css';
// First: registers the MapLibre worker URL before any map is created.
import { exposeMapForTests } from './maplibre-setup';

import { MapboxOverlay } from '@deck.gl/mapbox';
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type RequestParameters,
} from 'maplibre-gl';
import { MapPinOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getAccessToken } from '@/shared/auth/session';
import { appConfig, type BasemapId } from '@/shared/config/env';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/shared/stores/ui-store';
import { useResolvedTheme } from '@/shared/theme/theme';

import { BasemapSwitcher } from './basemap-switcher';
import { basemapAttribution, basemapStyle, resolveBasemap } from './basemaps';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from './constants';
import { MapContext, type MapContextValue } from './context';
import { MapLayerRegistry } from './layer-registry';

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Sends the access token with requests for the gateway's vector tiles (/tiles, spec §12). */
function transformRequest(url: string): RequestParameters {
  try {
    const parsed = new URL(url, window.location.href);
    if (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith(appConfig.tilesBaseUrl)
    ) {
      const token = getAccessToken();
      if (token) return { url, headers: { Authorization: `Bearer ${token}` } };
    }
  } catch {
    // not a URL MapLibre can fetch: leave it alone
  }
  return { url };
}

export interface MapViewProps {
  /** [lon, lat]; defaults to Batam (legacy default view). */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Controlled basemap; defaults to the user's last choice. */
  basemap?: BasemapId;
  onBasemapChange?: (basemap: BasemapId) => void;
  showBasemapSwitcher?: boolean;
  showNavigation?: boolean;
  showScale?: boolean;
  className?: string;
  /** Rendered inside the map context: layer components and absolutely positioned overlays. */
  children?: ReactNode;
  ariaLabel?: string;
  onMapReady?: (context: MapContextValue) => void;
}

/**
 * MapLibre GL map with a deck.gl overlay.
 *
 * Integration: `@deck.gl/mapbox` MapboxOverlay in overlaid mode (interleaved: false) added
 * as a MapLibre control — deck layers survive basemap (style) switches and are managed by
 * the layer registry (useDeckLayers / useMapLibreLayers). Attributions are always visible
 * (non-compact AttributionControl).
 */
export function MapView({
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  basemap: basemapProp,
  onBasemapChange,
  showBasemapSwitcher = true,
  showNavigation = true,
  showScale = true,
  className,
  children,
  ariaLabel,
  onMapReady,
}: MapViewProps) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const storedBasemap = useUiStore((state) => state.basemap);
  const setStoredBasemap = useUiStore((state) => state.setBasemap);
  const basemap = resolveBasemap(basemapProp ?? storedBasemap);
  const setBasemap = onBasemapChange ?? setStoredBasemap;

  const containerRef = useRef<HTMLDivElement>(null);
  const appliedStyle = useRef<string | null>(null);
  const attributionRef = useRef<AttributionControl | null>(null);
  const [webgl] = useState(supportsWebGL);
  const [failed, setFailed] = useState(false);
  const [initial] = useState(() => ({ basemap, theme, center: initialCenter, zoom: initialZoom }));
  const [instance, setInstance] = useState<Pick<
    MapContextValue,
    'map' | 'overlay' | 'registry'
  > | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webgl) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: basemapStyle(initial.basemap, initial.theme),
        center: initial.center,
        zoom: initial.zoom,
        attributionControl: false,
        transformRequest,
        maxPitch: 60,
        fadeDuration: 120,
      });
    } catch (error) {
      console.error('[map] MapLibre could not start', error);
      void Promise.resolve().then(() => setFailed(true));
      return;
    }
    appliedStyle.current = `${initial.basemap}:${initial.theme}`;
    const attribution = new AttributionControl({
      compact: false,
      customAttribution: basemapAttribution(initial.basemap),
    });
    attributionRef.current = attribution;
    map.addControl(attribution, 'bottom-right');
    if (showNavigation)
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    if (showScale)
      map.addControl(new ScaleControl({ unit: 'nautical', maxWidth: 120 }), 'bottom-left');

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    const unexpose = exposeMapForTests(map);
    const registry = new MapLayerRegistry(map, overlay);
    overlay.setProps({ getTooltip: (info) => registry.tooltip(info) });

    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      setInstance({ map, overlay, registry });
    };
    map.once('style.load', markReady);
    map.once('load', markReady);
    // Tile errors (offline, blocked hosts) are expected and must not flood the console; a
    // listener replaces MapLibre's default console.error reporting.
    map.on('error', () => undefined);

    return () => {
      unexpose();
      registry.dispose();
      overlay.finalize();
      map.remove();
      attributionRef.current = null;
      appliedStyle.current = null;
    };
  }, [webgl, initial, showNavigation, showScale]);

  // Basemap or theme switch: swap the style; the registry re-adds MapLibre layers.
  useEffect(() => {
    if (!instance) return;
    const key = `${basemap}:${theme}`;
    if (appliedStyle.current === key) return;
    appliedStyle.current = key;
    instance.map.setStyle(basemapStyle(basemap, theme));
    const previous = attributionRef.current;
    if (previous) instance.map.removeControl(previous);
    const attribution = new AttributionControl({
      compact: false,
      customAttribution: basemapAttribution(basemap),
    });
    attributionRef.current = attribution;
    instance.map.addControl(attribution, 'bottom-right');
  }, [instance, basemap, theme]);

  const context = useMemo<MapContextValue | null>(
    () => (instance ? { ...instance, basemap, setBasemap } : null),
    [instance, basemap, setBasemap],
  );

  useEffect(() => {
    if (context) onMapReady?.(context);
    // only when the map becomes ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.map]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-map-water', className)}>
      {/* size-full, not absolute: maplibre-gl.css sets position: relative on its container (unlayered CSS wins over Tailwind utilities). */}
      <div
        ref={containerRef}
        className="size-full"
        role="region"
        aria-label={ariaLabel ?? t('map.vessels')}
        data-testid="map-canvas"
      />
      {(!webgl || failed) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <EmptyState
            icon={MapPinOff}
            title={t('map.noWebgl')}
            description={t('map.noWebglDescription')}
          />
        </div>
      )}
      {context && (
        <MapContext.Provider value={context}>
          {showBasemapSwitcher && <BasemapSwitcher />}
          {children}
        </MapContext.Provider>
      )}
    </div>
  );
}
