import { expect, test } from '@playwright/test';

import { login } from './fixtures';

/** The bits of a MapLibre map the test drives (window.__AIS_E2E_MAPS__, VITE_E2E_HOOKS build). */
interface ProbeMap {
  isStyleLoaded(): boolean;
  getCenter(): { lng: number; lat: number };
  addSource(id: string, source: unknown): void;
  addLayer(layer: unknown): void;
  isSourceLoaded(id: string): boolean;
  queryRenderedFeatures(options: { layers: string[] }): unknown[];
}

test.describe('map', () => {
  test('MapLibre workers load: a GeoJSON layer renders on the live map', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await login(page);
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('link', { name: 'Peta Live' })
      .click();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Peta Live' })).toBeAttached();
    await page.waitForFunction(() => {
      const maps = (window as unknown as { __AIS_E2E_MAPS__?: ProbeMap[] }).__AIS_E2E_MAPS__;
      return !!maps?.at(-1)?.isStyleLoaded();
    });

    // GeoJSON sources are parsed in MapLibre's web worker: without a working worker URL the
    // source never loads and nothing renders (useMapLibreLayers, vector basemaps, /tiles).
    const rendered = await page.evaluate(async () => {
      const map = (window as unknown as { __AIS_E2E_MAPS__: ProbeMap[] }).__AIS_E2E_MAPS__.at(-1)!;
      const { lng, lat } = map.getCenter();
      map.addSource('e2e-probe', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [lng, lat] },
            },
          ],
        },
      });
      map.addLayer({
        id: 'e2e-probe',
        type: 'circle',
        source: 'e2e-probe',
        paint: { 'circle-radius': 14, 'circle-color': '#ff00ff' },
      });
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (
          map.isSourceLoaded('e2e-probe') &&
          map.queryRenderedFeatures({ layers: ['e2e-probe'] }).length > 0
        ) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    });
    expect(rendered).toBe(true);
    expect(errors.filter((text) => /worker/i.test(text))).toEqual([]);
  });

  test('the worker is a content-hashed JavaScript asset', async ({ page, request }) => {
    const workers: string[] = [];
    page.on('request', (req) => {
      if (/maplibre-gl-worker-[\w-]+\.mjs/.test(req.url())) workers.push(req.url());
    });
    await login(page);
    await page.goto('/map');
    await expect.poll(() => workers.length).toBeGreaterThan(0);
    const response = await request.get(workers[0]!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/javascript/);
  });
});
