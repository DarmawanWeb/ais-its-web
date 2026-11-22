#!/bin/sh
# Smoke test of a running ais-its-web container: health, SPA fallback, security and cache
# headers, and the MIME type of the MapLibre worker (module workers refuse non-JavaScript
# types under "X-Content-Type-Options: nosniff").
#
#   docker run -d --name web -p 8080:8080 ais-its-web
#   docker/smoke-test.sh web http://localhost:8080
set -eu

CONTAINER=${1:?usage: smoke-test.sh <container> [base-url]}
BASE=${2:-http://localhost:8080}

fail() {
  echo "smoke test failed: $*" >&2
  exit 1
}
status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
header() {
  curl -s -o /dev/null -D - "$BASE$1" | tr -d '\r' | grep -i "^$2:" | head -n 1 | cut -d' ' -f2-
}
asset() { docker exec "$CONTAINER" ls /usr/share/nginx/html/assets | grep -E "$1" | head -n 1; }

tries=0
until [ "$(status /healthz)" = 200 ]; do
  tries=$((tries + 1))
  [ "$tries" -le 30 ] || fail "/healthz did not answer 200"
  sleep 1
done

[ "$(status /dashboard)" = 200 ] || fail "SPA fallback for /dashboard"
[ "$(header /index.html cache-control)" = "no-cache" ] || fail "index.html must be no-cache"
[ "$(header /config.js cache-control)" = "no-store" ] || fail "config.js must be no-store"
[ -n "$(header / content-security-policy)" ] || fail "Content-Security-Policy header missing"
[ "$(header / x-content-type-options)" = "nosniff" ] || fail "nosniff header missing"
[ "$(status /api/v2/me)" = 404 ] || fail "/api must not be answered by the SPA"

worker=$(asset '^maplibre-gl-worker-.+\.mjs$')
[ -n "$worker" ] || fail "MapLibre worker asset missing (setWorkerUrl ?url import)"
case "$(header "/assets/$worker" content-type)" in
  *javascript*) ;;
  *) fail "worker served as '$(header "/assets/$worker" content-type)', not JavaScript" ;;
esac
case "$(header "/assets/$worker" cache-control)" in
  *immutable*) ;;
  *) fail "worker is not cached as immutable" ;;
esac

font=$(asset '\.woff2$')
case "$(header "/assets/$font" cache-control)" in
  *immutable*) ;;
  *) fail "hashed font $font is not cached as immutable" ;;
esac

[ "$(status /assets/missing-asset.js)" = 404 ] || fail "missing asset must answer 404"
[ "$(header /assets/missing-asset.js cache-control)" = "no-store" ] ||
  fail "a missing asset must not be cacheable"

echo "smoke test passed ($BASE)"
