/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_REALTIME_URL?: string;
  readonly VITE_REALTIME_PATH?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_STYLE_LIGHT_URL?: string;
  readonly VITE_MAP_OSM_TILES_URL?: string;
  readonly VITE_MAP_SATELLITE_TILES_URL?: string;
  readonly VITE_MAP_STYLE_ATTRIBUTION?: string;
  readonly VITE_MAP_DEFAULT_BASEMAP?: string;
  readonly VITE_TILES_BASE_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_QUERY_DEVTOOLS?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
  /** "true" only in the Playwright build: exposes test hooks (window.__AIS_E2E_MAPS__). */
  readonly VITE_E2E_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
