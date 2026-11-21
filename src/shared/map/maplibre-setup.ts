import { type Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

/**
 * MapLibre GL bootstrap, evaluated once before any map is created (imported first by
 * map-view.tsx).
 *
 * MapLibre 6 starts its web workers from `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
 * a file Vite does not emit. Without this call every feature that needs the workers fails
 * silently ("Worker failed to load"): GeoJSON sources added with useMapLibreLayers, vector
 * basemaps (VITE_MAP_STYLE_URL) and the Martin tiles under /tiles. The `?url` import emits the
 * self-contained worker as a content-hashed asset (assets/maplibre-gl-worker-<hash>.mjs; nginx
 * serves .mjs as JavaScript, which module workers require).
 */
setWorkerUrl(workerUrl);

declare global {
  interface Window {
    /** E2E builds only (VITE_E2E_HOOKS=true): the live MapLibre maps, newest last. */
    __AIS_E2E_MAPS__?: MapLibreMap[];
  }
}

/**
 * Exposes a map to Playwright (`window.__AIS_E2E_MAPS__`) so tests can query MapLibre layers
 * (`queryRenderedFeatures`). Compiled out of normal builds: only the e2e build sets
 * VITE_E2E_HOOKS=true (playwright.config.ts). Returns the unregister function.
 */
export function exposeMapForTests(map: MapLibreMap): () => void {
  if (import.meta.env.VITE_E2E_HOOKS !== 'true') return () => undefined;
  const maps = (window.__AIS_E2E_MAPS__ ??= []);
  maps.push(map);
  return () => {
    const index = maps.indexOf(map);
    if (index >= 0) maps.splice(index, 1);
  };
}
