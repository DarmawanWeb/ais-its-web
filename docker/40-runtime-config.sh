#!/bin/sh
# Writes /config.js (window.__AIS_CONFIG__) from the container environment at start, so one
# image runs in every environment. Keys: src/shared/config/env.ts. Empty variables are left
# out (the build-time default applies).
set -eu

out="${AIS_CONFIG_PATH:-/usr/share/nginx/html/config.js}"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

entry() {
  eval "value=\${$2:-}"
  if [ -n "$value" ]; then
    printf '  "%s": "%s",\n' "$1" "$(json_escape "$value")"
  fi
}

{
  echo '// Generated at container start by /docker-entrypoint.d/40-runtime-config.sh.'
  echo 'window.__AIS_CONFIG__ = {'
  entry apiBaseUrl VITE_API_BASE_URL
  entry realtimeUrl VITE_REALTIME_URL
  entry realtimePath VITE_REALTIME_PATH
  entry mapStyleUrl VITE_MAP_STYLE_URL
  entry mapStyleLightUrl VITE_MAP_STYLE_LIGHT_URL
  entry osmTilesUrl VITE_MAP_OSM_TILES_URL
  entry satelliteTilesUrl VITE_MAP_SATELLITE_TILES_URL
  entry mapStyleAttribution VITE_MAP_STYLE_ATTRIBUTION
  entry defaultBasemap VITE_MAP_DEFAULT_BASEMAP
  entry tilesBaseUrl VITE_TILES_BASE_URL
  entry defaultLocale VITE_DEFAULT_LOCALE
  entry environment VITE_APP_ENV
  echo '};'
} > "$out"

echo "40-runtime-config.sh: wrote $out"
