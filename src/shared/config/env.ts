import * as z from 'zod';

/**
 * Runtime configuration.
 *
 * Containers write `window.__AIS_CONFIG__` into /config.js at start (docker/40-runtime-config.sh)
 * so one image runs in every environment; during development the VITE_* variables of `.env`
 * are used. Runtime values win over build-time values.
 */
const BasemapIdSchema = z.enum(['vector', 'osm', 'satellite']);

const AppConfigSchema = z.object({
  /** Base URL of the HTTP API; empty = same origin (the gateway serves /api). */
  apiBaseUrl: z.string().default(''),
  /** Origin of the realtime socket.io server; empty = same origin. */
  realtimeUrl: z.string().default(''),
  /** socket.io path (spec §9). */
  realtimePath: z.string().default('/ws'),
  /** Dark vector basemap style (MapLibre style JSON URL); empty = OSM raster fallback. */
  mapStyleUrl: z.string().default(''),
  /** Optional light vector style used by the light theme. */
  mapStyleLightUrl: z.string().default(''),
  /** OpenStreetMap raster tile URL template. */
  osmTilesUrl: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  /** Satellite raster tile URL template (Esri World Imagery as in the legacy app). */
  satelliteTilesUrl: z
    .string()
    .default(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ),
  /** Attribution of the vector style (e.g. Stadia Maps / OpenMapTiles / OSM). */
  mapStyleAttribution: z
    .string()
    .default(
      '© <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    ),
  defaultBasemap: BasemapIdSchema.optional(),
  /** Martin vector tiles behind the gateway (spec §12). */
  tilesBaseUrl: z.string().default('/tiles'),
  defaultLocale: z.enum(['id', 'en']).default('id'),
  environment: z.string().default('development'),
  appVersion: z.string().default('0.1.0'),
  enableQueryDevtools: z.boolean().default(false),
});

export type AppConfig = z.output<typeof AppConfigSchema>;
export type BasemapId = z.infer<typeof BasemapIdSchema>;

declare global {
  interface Window {
    __AIS_CONFIG__?: Record<string, unknown>;
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function buildTimeConfig(): Record<string, unknown> {
  const env = import.meta.env;
  const entries: Record<string, unknown> = {
    apiBaseUrl: nonEmpty(env.VITE_API_BASE_URL),
    realtimeUrl: nonEmpty(env.VITE_REALTIME_URL),
    realtimePath: nonEmpty(env.VITE_REALTIME_PATH),
    mapStyleUrl: nonEmpty(env.VITE_MAP_STYLE_URL),
    mapStyleLightUrl: nonEmpty(env.VITE_MAP_STYLE_LIGHT_URL),
    osmTilesUrl: nonEmpty(env.VITE_MAP_OSM_TILES_URL),
    satelliteTilesUrl: nonEmpty(env.VITE_MAP_SATELLITE_TILES_URL),
    mapStyleAttribution: nonEmpty(env.VITE_MAP_STYLE_ATTRIBUTION),
    defaultBasemap: nonEmpty(env.VITE_MAP_DEFAULT_BASEMAP),
    tilesBaseUrl: nonEmpty(env.VITE_TILES_BASE_URL),
    defaultLocale: nonEmpty(env.VITE_DEFAULT_LOCALE),
    environment: nonEmpty(env.VITE_APP_ENV) ?? env.MODE,
    appVersion: nonEmpty(env.VITE_APP_VERSION),
    enableQueryDevtools: env.DEV && env.VITE_QUERY_DEVTOOLS !== 'false',
  };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function runtimeConfig(): Record<string, unknown> {
  if (typeof window === 'undefined' || !window.__AIS_CONFIG__) return {};
  return Object.fromEntries(
    Object.entries(window.__AIS_CONFIG__).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

function loadConfig(): AppConfig {
  const merged = { ...buildTimeConfig(), ...runtimeConfig() };
  const parsed = AppConfigSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  console.error('Invalid runtime configuration, using defaults', parsed.error.issues);
  return AppConfigSchema.parse({});
}

/** The resolved application configuration (read once at startup). */
export const appConfig: AppConfig = loadConfig();
