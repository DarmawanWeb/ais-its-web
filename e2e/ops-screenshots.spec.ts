import { expect, test, type Page } from '@playwright/test';

import { login, resetMockGateway, USERS } from './fixtures';

/**
 * Documentation screenshots of the operations & safety pages (map, alerts, safety) in both
 * themes at 1440×900, plus 390×844 for the main page of each feature:
 * docs/screenshots/<feature>-<page>-<variant>.png. Runs in the `screenshots` project only
 * (`pnpm screenshots`), like e2e/screenshots.spec.ts.
 */
const DIR = 'docs/screenshots';
const THEMES = ['dark', 'light'] as const;

const PIPELINE = [
  [103.66, 1.232],
  [103.76, 1.2],
  [103.85, 1.172],
  [103.9025, 1.1528],
  [103.945, 1.112],
  [103.99, 1.081],
  [104.06, 1.045],
];

const feature = (
  id: string,
  name: string,
  kind: string,
  geometry: unknown,
  orgId: string | null = null,
) => ({
  type: 'Feature',
  id,
  geometry,
  properties: {
    id,
    orgId,
    global: orgId === null,
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

const box = (lon: number, lat: number, dLon: number, dLat: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lon, lat],
      [lon + dLon, lat],
      [lon + dLon, lat + dLat],
      [lon, lat + dLat],
      [lon, lat],
    ],
  ],
});

/** Zones, events and tracks of services owned by other features: fixed for the pictures. */
async function routeData(page: Page) {
  await page.route('**/api/v2/zones/geojson**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          feature('z1', 'Pipa Gas Batam', 'pipeline', {
            type: 'LineString',
            coordinates: PIPELINE,
          }),
          feature('z2', 'Zona Terbatas Pulau Nipa', 'restricted', box(104.045, 1.125, 0.05, 0.05)),
          feature(
            'z3',
            'Area Transhipment Batam',
            'transhipment_area',
            box(103.94, 1.2, 0.08, 0.06),
          ),
          feature(
            'z4',
            'Area Labuh Batu Ampar',
            'anchorage',
            box(103.973, 1.163, 0.024, 0.024),
            '0192f0c8-7d3a-7c2e-9a1b-000000000001',
          ),
          feature(
            'z5',
            'Daerah Penangkapan Ikan Selatan',
            'fishing_ground',
            box(103.76, 1.02, 0.1, 0.05),
          ),
        ],
        truncated: false,
        truncatedBy: null,
        limit: 2000,
        vertexLimit: 200000,
        featureCount: 5,
        vertexCount: 27,
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
    const points = Array.from({ length: 90 }, (_, i) => {
      const f = i / 89;
      return {
        time: new Date(from + (to - from) * f).toISOString(),
        lat: 1.152 + (1 - f) * 0.09 + Math.sin(f * 6) * 0.006,
        lon: 103.902 + (1 - f) * 0.16,
        sog: 9.8,
        cog: 248,
        hdg: 248,
        navstatus: 0,
        predictedNavstatus: 0,
        source: 'primary',
      };
    });
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

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

test.describe('operations & safety screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockGateway();
    await routeData(page);
  });

  for (const theme of THEMES) {
    test(`map (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);
      await page.goto('/map?lat=1.14800&lon=103.90000&z=10.6');
      await expect(page.getByTestId('vessel-count')).not.toHaveText('0');
      await settle(page, 2500);
      await page.screenshot({ path: `${DIR}/map-live-${theme}.png` });

      await page.goto('/map?lat=1.16500&lon=103.96000&z=11.2&vessel=525005223');
      await expect(page.getByTestId('vessel-panel-name')).toHaveText('KM Bahari Nusantara');
      await page.getByTestId('track-toggle').click();
      await expect(page.getByTestId('track-time')).toBeVisible();
      await page.getByTestId('map-legend').getByRole('button').first().click();
      await page
        .getByTestId('vessel-panel')
        .evaluate((element) => element.parentElement?.scrollTo(0, 0));
      await settle(page, 2500);
      await page.screenshot({ path: `${DIR}/map-vessel-${theme}.png` });
    });

    test(`alerts (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);
      await page.goto('/alerts?status=all');
      await expect(
        page.getByRole('table', { name: 'Kotak masuk alert' }).getByRole('row'),
      ).not.toHaveCount(1);
      await settle(page);
      await page.screenshot({ path: `${DIR}/alerts-inbox-${theme}.png` });

      await page.getByRole('row', { name: /Bahaya EWS/ }).click();
      await expect(page.getByTestId('alert-mini-map')).toBeVisible();
      await settle(page, 2000);
      await page.screenshot({ path: `${DIR}/alerts-detail-${theme}.png` });

      await page.keyboard.press('Escape');
      await page.getByTestId('alerts-bell').click();
      await expect(page.getByRole('list', { name: 'Alert terbaru' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/alerts-bell-${theme}.png` });
    });

    test(`safety (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);
      await page.goto('/safety/ews');
      await expect(
        page.getByRole('table', { name: 'Kapal di sekitar pipa' }).getByRole('row'),
      ).toHaveCount(3);
      await settle(page, 2500);
      await page.screenshot({ path: `${DIR}/safety-ews-${theme}.png` });

      await page.goto('/safety/collision');
      await expect(
        page.getByRole('table', { name: 'Pertemuan kapal' }).getByRole('row'),
      ).not.toHaveCount(1);
      await settle(page);
      await page.screenshot({ path: `${DIR}/safety-collision-${theme}.png` });

      await page.getByRole('row', { name: /MV Batam Express/ }).click();
      await expect(page.getByTestId('encounter-chart')).toBeVisible();
      await settle(page, 2500);
      await page.screenshot({ path: `${DIR}/safety-collision-detail-${theme}.png` });
    });
  }

  test('main pages on a phone (390×844)', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.admin);

    await page.goto('/map');
    await expect(page.getByRole('heading', { level: 1, name: 'Peta Live' })).toBeAttached();
    await settle(page, 2500);
    await page.screenshot({ path: `${DIR}/map-live-mobile.png` });

    await page.goto('/alerts');
    await expect(page.getByRole('heading', { level: 1, name: 'Alert' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/alerts-inbox-mobile.png` });

    await page.goto('/safety/ews');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Peringatan Dini Pipa Bawah Laut' }),
    ).toBeVisible();
    await settle(page, 2500);
    await page.screenshot({ path: `${DIR}/safety-ews-mobile.png` });

    await page.goto('/safety/collision');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Risiko Tubrukan (CPA/TCPA)' }),
    ).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/safety-collision-mobile.png` });
  });
});
