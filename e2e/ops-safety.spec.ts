import { expect, test, type Page } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

/** The demo pipeline of the safety mock (EWS distances are measured to this line). */
const PIPELINE = [
  [103.66, 1.232],
  [103.76, 1.2],
  [103.85, 1.172],
  [103.9025, 1.1528],
  [103.945, 1.112],
  [103.99, 1.081],
  [104.06, 1.045],
];
const PIPELINE_ZONE_ID = '0192f0c8-7d3a-7c2e-9a1d-000000000001';

/** Pipelines and pair tracks come from services of other features: fixed for these tests. */
async function routeSharedData(page: Page) {
  await page.route('**/api/v2/zones/geojson**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: PIPELINE_ZONE_ID,
            geometry: { type: 'LineString', coordinates: PIPELINE },
            properties: {
              id: PIPELINE_ZONE_ID,
              orgId: null,
              global: true,
              code: 'pipa-gas-batam',
              name: 'Pipa Gas Batam (KP 0–48)',
              kind: 'pipeline',
              bufferM: 1750,
              alertOnEnter: false,
              active: true,
              updatedAt: '2026-11-01T00:00:00.000Z',
              zoneProperties: {},
            },
          },
        ],
        truncated: false,
        truncatedBy: null,
        limit: 2000,
        vertexLimit: 200000,
        featureCount: 1,
        vertexCount: PIPELINE.length,
        zoom: null,
        toleranceDeg: 0,
      },
    }),
  );
  await page.route('**/api/v2/ais/pairs/track**', (route) => {
    const url = new URL(route.request().url());
    const to = Date.parse(url.searchParams.get('to') ?? new Date().toISOString());
    const from = Date.parse(url.searchParams.get('from') ?? new Date(to - 3_600_000).toISOString());
    const track = (mmsi: number, lat: number, lon: number, dLat: number, dLon: number) => ({
      mmsi,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      resolution: 'raw',
      simplifyM: null,
      truncated: false,
      remainingTo: null,
      points: Array.from({ length: 30 }, (_, i) => ({
        time: new Date(from + ((to - from) * i) / 29).toISOString(),
        lat: lat + dLat * (i - 29),
        lon: lon + dLon * (i - 29),
        sog: 12,
        cog: 90,
        hdg: 90,
        navstatus: 0,
        predictedNavstatus: 0,
        source: 'primary',
      })),
    });
    const mmsi1 = Number(url.searchParams.get('mmsi1'));
    const mmsi2 = Number(url.searchParams.get('mmsi2'));
    return route.fulfill({
      json: {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        tracks: [
          track(mmsi1, 1.205, 103.83, -0.0008, -0.0012),
          track(mmsi2, 1.25, 103.86, 0.0011, -0.0004),
        ],
      },
    });
  });
}

test.describe('safety (operations)', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockGateway();
    await routeSharedData(page);
  });

  test('EWS: vessels near pipelines, status filter, map selection, events and the rule', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/safety/ews');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Peringatan Dini Pipa Bawah Laut' }),
    ).toBeVisible();

    const vessels = page.getByRole('table', { name: 'Kapal di sekitar pipa' });
    await expect(vessels.getByRole('row')).toHaveCount(3);
    await expect(vessels.getByRole('row').nth(1)).toContainText('KM Bahari Nusantara');
    await expect(vessels.getByRole('row').nth(1)).toContainText('Bahaya');
    await expect(vessels.getByRole('row').nth(1)).toContainText('103');
    await expect(vessels.getByRole('row').nth(2)).toContainText('Peringatan');
    await expect(page.getByText('Koridor bahaya ±500 m')).toBeVisible();
    await expect(page.getByTestId('map-canvas')).toBeVisible();

    await page.getByTestId('ews-filter-3').click();
    await expect(page).toHaveURL(/status=0%2C1%2C3|status=0,1,3/);
    await expect(page.getByText('14 data')).toBeVisible();

    await vessels.getByRole('row', { name: /KM Bahari Nusantara/ }).click();
    await expect(page).toHaveURL(/vessel=525005223/);

    const events = page.getByRole('table', { name: 'Riwayat kejadian EWS' });
    await expect(events.getByRole('row')).toHaveCount(4);
    await page.getByRole('radio', { name: 'Selesai' }).click();
    await expect(events.getByRole('row')).toHaveCount(2);

    const rule = page.getByRole('region', { name: /Cara kerja aturan EWS/ });
    await expect(rule.getByText('Jarak < 500 m')).toBeVisible();
    await expect(rule.getByText('Ambang aktif detektor')).toBeVisible();
    await expect(rule.getByRole('link').first()).toHaveAttribute('target', '_blank');
    expect(await axeViolations(page)).toEqual([]);
  });

  test('collision: encounters, risk filter, detail with CPA/TCPA history and both tracks', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/safety/collision');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Risiko Tubrukan (CPA/TCPA)' }),
    ).toBeVisible();
    const table = page.getByRole('table', { name: 'Pertemuan kapal' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(
      page
        .getByRole('region', { name: /Pita risiko tubrukan/ })
        .getByText('CPA < 0,25 nm · TCPA < 6 mnt'),
    ).toBeVisible();

    await page.getByTestId('collision-risk-low').click();
    await expect(page).toHaveURL(/risk=high%2Cmedium|risk=high,medium/);
    await expect(table.getByRole('row')).toHaveCount(4);

    await page.getByRole('combobox', { name: 'Rentang waktu' }).click();
    await page.getByRole('option', { name: '31 hari terakhir' }).click();
    await expect(table.getByRole('row')).toHaveCount(5);

    await table.getByRole('row', { name: /MV Batam Express/ }).click();
    await expect(page).toHaveURL(/encounter=/);
    const detail = page.getByTestId('encounter-detail');
    await expect(
      detail.getByRole('heading', { name: 'MV Batam Express ↔ LNG Natuna' }),
    ).toBeVisible();
    await expect(detail.getByTestId('encounter-chart')).toBeVisible();
    await expect(detail.getByTestId('encounter-map')).toBeVisible();
    await detail.getByText(/Tampilkan data \d+ sampel/).click();
    await expect(detail.getByRole('table', { name: 'Sampel CPA/TCPA pertemuan' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    // Shareable: the detail opens from the URL.
    await page.reload();
    await expect(
      page
        .getByTestId('encounter-detail')
        .getByRole('heading', { name: 'MV Batam Express ↔ LNG Natuna' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/encounter=/);
  });
});
