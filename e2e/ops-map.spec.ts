import type { RealtimePosition } from '@darmawanweb/ais-its-contracts/realtime';
import { expect, test, type Page } from '@playwright/test';

import {
  axeViolations,
  login,
  pushRealtime,
  resetMockGateway,
  USERS,
  waitForRealtimeRoom,
} from './fixtures';

const PIPELINE = [
  [103.66, 1.232],
  [103.76, 1.2],
  [103.85, 1.172],
  [103.9025, 1.1528],
  [103.945, 1.112],
  [103.99, 1.081],
  [104.06, 1.045],
];

const zone = (id: string, name: string, kind: string, geometry: unknown) => ({
  type: 'Feature',
  id,
  geometry,
  properties: {
    id,
    orgId: null,
    global: true,
    code: id,
    name,
    kind,
    bufferM: 0,
    alertOnEnter: false,
    active: true,
    updatedAt: '2026-11-01T00:00:00.000Z',
    zoneProperties: {},
  },
});

/** Data of services owned by other features, fixed for these tests. */
async function routeMapData(page: Page) {
  await page.route('**/api/v2/zones/geojson**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          zone('0192f0c8-7d3a-7c2e-9a1d-000000000001', 'Pipa Gas Batam', 'pipeline', {
            type: 'LineString',
            coordinates: PIPELINE,
          }),
          zone('0192f0c8-7d3a-7c2e-9a1d-000000000002', 'Zona Terbatas Pulau Nipa', 'restricted', {
            type: 'Polygon',
            coordinates: [
              [
                [104.045, 1.125],
                [104.095, 1.125],
                [104.095, 1.175],
                [104.045, 1.175],
                [104.045, 1.125],
              ],
            ],
          }),
        ],
        truncated: true,
        truncatedBy: 'features',
        limit: 2,
        vertexLimit: 200000,
        featureCount: 2,
        vertexCount: 12,
        zoom: 9,
        toleranceDeg: 0,
      },
    }),
  );
  // The vessel panel names the nearest pipeline from the zone detail (geo service).
  await page.route('**/api/v2/zones/0192f0c8-7d3a-7c2e-9a1d-000000000001', (route) =>
    route.fulfill({
      json: {
        id: '0192f0c8-7d3a-7c2e-9a1d-000000000001',
        orgId: null,
        global: true,
        code: 'PGB-01',
        name: 'Pipa Gas Batam',
        kind: 'pipeline',
        bufferM: 1750,
        alertOnEnter: false,
        active: true,
        properties: {},
        source: null,
        createdBy: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        geometryType: 'LineString',
        vertexCount: PIPELINE.length,
        bbox: [103.66, 1.045, 104.06, 1.232],
        geometry: { type: 'LineString', coordinates: PIPELINE },
      },
    }),
  );
  await page.route('**/api/v2/ais/vessels/*/track**', (route) => {
    const url = new URL(route.request().url());
    const to = Date.parse(url.searchParams.get('to') ?? new Date().toISOString());
    const from = Date.parse(
      url.searchParams.get('from') ?? new Date(to - 6 * 3_600_000).toISOString(),
    );
    const points = Array.from({ length: 60 }, (_, i) => ({
      time: new Date(from + ((to - from) * i) / 59).toISOString(),
      lat: 1.1 + i * 0.001,
      lon: 103.95 - i * 0.0008,
      sog: 9 + (i % 5) * 0.2,
      cog: 300,
      hdg: 300,
      navstatus: 0,
      predictedNavstatus: 0,
      source: 'primary',
    }));
    return route.fulfill({
      json: {
        mmsi: 525005223,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        resolution: 'raw',
        simplifyM: null,
        truncated: false,
        remainingTo: null,
        points,
      },
    });
  });
}

test.describe('live map (operations)', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockGateway();
    await routeMapData(page);
  });

  test('search flies to a vessel; its panel shows safety, alerts and plays the track', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/map');
    await expect(page.getByTestId('vessel-count')).toHaveText('14');
    const status = page.getByTestId('map-status');
    await expect(status.getByTitle('EWS bahaya')).toContainText('1');
    await expect(status.getByTitle('Risiko tubrukan tinggi')).toContainText('2');

    await page.getByTestId('map-search').fill('bahari');
    await page.getByRole('option', { name: /KM Bahari Nusantara/ }).click();
    await expect(page).toHaveURL(/vessel=525005223/);
    const panel = page.getByTestId('vessel-panel');
    await expect(panel.getByTestId('vessel-panel-name')).toHaveText('KM Bahari Nusantara');
    await expect(panel.getByText('Bahaya', { exact: true })).toBeVisible();
    await expect(panel.getByText('103', { exact: false }).first()).toBeVisible();
    await expect(panel.getByText('Pipa Gas Batam')).toBeVisible();
    await expect(
      panel.getByRole('link', { name: /Bahaya EWS: KM Bahari Nusantara/ }),
    ).toBeVisible();
    await expect(panel.getByRole('link', { name: /Halaman kapal/ })).toHaveAttribute(
      'href',
      '/vessels/525005223',
    );

    await panel.getByTestId('track-toggle').click();
    const time = panel.getByTestId('track-time');
    await expect(time).toBeVisible();
    const end = await time.textContent();
    await panel.getByTestId('track-slider').focus();
    await page.keyboard.press('Home');
    await expect(time).not.toHaveText(end ?? '');
    const start = await time.textContent();
    await panel.getByTestId('track-play').click();
    await expect(time).not.toHaveText(start ?? '', { timeout: 5_000 });
    expect(await axeViolations(page)).toEqual([]);

    // Shareable link: the selection comes back with the URL.
    await page.reload();
    await expect(page.getByTestId('vessel-panel').getByTestId('vessel-panel-name')).toHaveText(
      'KM Bahari Nusantara',
    );
    await page.getByRole('complementary').getByRole('button', { name: 'Tutup' }).click();
    await expect(page).not.toHaveURL(/vessel=/);
  });

  test('layers and filters change the map; zones come from GeoJSON when tiles fail', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/map?lat=1.14324&lon=103.90000&z=10&layers=vessels,zones,pipelines,events');
    await expect(page.getByTestId('vessel-count')).not.toHaveText('0');
    await expect(page.getByTestId('layer-events')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('layer-encounters')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('zones-truncated')).toBeVisible();

    // The mock has no tile server: global zones come from GET /zones/geojson (MapLibre layers).
    await page.waitForFunction(() => {
      type ProbeMap = {
        getLayer(id: string): unknown;
        queryRenderedFeatures(o: { layers: string[] }): unknown[];
      };
      const map = (window as unknown as { __AIS_E2E_MAPS__?: ProbeMap[] }).__AIS_E2E_MAPS__?.at(-1);
      return (
        !!map?.getLayer('live-zones-org-pipeline') &&
        map.queryRenderedFeatures({ layers: ['live-zones-org-pipeline'] }).length > 0
      );
    });

    await page.getByTestId('layer-encounters').click();
    await expect(page).toHaveURL(/layers=[^&]*encounters/);

    await page.getByRole('tab', { name: 'Filter' }).click();
    await page.getByRole('checkbox', { name: 'Normal' }).click();
    await expect(page.getByTestId('vessel-count')).toHaveText('6');
    await expect(page.getByTestId('map-controls-toggle')).toContainText('1 filter');
    await page.getByRole('button', { name: 'Atur ulang filter' }).click();
    await expect(page.getByTestId('vessel-count')).not.toHaveText('6');
  });

  test('10 000 live vessels: one realtime burst, dots instead of piled-up icons, still searchable', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/map?lat=1.14300&lon=103.85700&z=10&layers=vessels');
    const count = page.getByTestId('vessel-count');
    await expect(count).toHaveText('14');
    await waitForRealtimeRoom(/^tile:/);

    // 10 000 vessels on a 100 × 100 grid around Batam, pushed in five batches of 2 000.
    const time = new Date().toISOString();
    const position = (k: number): RealtimePosition => ({
      mmsi: 400_000_000 + k,
      time,
      lat: 1.143 + ((k % 100) - 50) * 0.0035,
      lon: 103.857 + (Math.floor(k / 100) - 50) * 0.006,
      sog: 8,
      cog: (k * 37) % 360,
      hdg: (k * 37) % 360,
      navstatus: 0,
      predictedNavstatus: 0,
      source: 'primary',
    });
    const started = Date.now();
    for (let batch = 0; batch < 5; batch++) {
      await pushRealtime({
        kind: 'positions',
        items: Array.from({ length: 2_000 }, (_, i) => position(batch * 2_000 + i)),
      });
    }
    await expect
      .poll(async () => Number(await count.textContent()), { timeout: 20_000 })
      .toBeGreaterThan(9_000);
    expect(Date.now() - started).toBeLessThan(20_000);
    // A crowded view draws dots (the level of detail says so) rather than overlapping icons.
    await expect(page.getByTestId('map-status')).toContainText('Titik');

    // The UI stays responsive: search finds one of the pushed vessels and opens it.
    await page.getByTestId('map-search').fill('400005050');
    await page.getByRole('option', { name: /400005050/ }).click();
    await expect(page).toHaveURL(/vessel=400005050/);
    await expect(page.getByTestId('vessel-panel')).toBeVisible();
  });

  test('realtime safety states update the rings and the counts', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/map');
    const danger = page.getByTestId('map-status').getByTitle('EWS bahaya');
    await expect(danger).toContainText('1');
    await waitForRealtimeRoom(/^tile:/);
    await expect
      .poll(
        async () => {
          await pushRealtime({
            kind: 'safety:states',
            items: [
              {
                mmsi: 525019006,
                time: new Date().toISOString(),
                lat: 1.02,
                lon: 103.93,
                ewsStatus: 0,
                collisionRisk: 'none',
                closestEncounter: null,
              },
            ],
          });
          return danger.textContent();
        },
        { timeout: 15_000 },
      )
      .toContain('2');
  });
});
