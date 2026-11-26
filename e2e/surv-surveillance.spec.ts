import { expect, test } from '@playwright/test';

import {
  axeViolations,
  expectRealtimeConnected,
  login,
  pushRealtime,
  resetMockGateway,
  USERS,
  waitForRealtimeRoom,
} from './fixtures';

/** Surveillance feature (spec §13.8) against e2e/mock-server/routes/surveillance.mjs. */
test.describe('surveillance', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('overview opens from /surveillance and links to the detector pages', async ({ page }) => {
    await login(page);
    await page.goto('/surveillance/overview');
    // earlier links of the overview open /surveillance
    await expect(page).toHaveURL(/\/surveillance$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ringkasan Pengawasan' }),
    ).toBeVisible();
    await expect(page.getByText('Antrean kandidat transhipment')).toBeVisible();
    await expect(page.getByRole('figure', { name: /Jumlah kejadian per jenis/ })).toBeVisible();
    // the overview entry is the only active link (sidebar and section navigation)
    await expect(
      page.locator('a[aria-current="page"]:not([href="/surveillance"])'),
    ).toHaveCount(0);
    await expect(
      page.locator('a[aria-current="page"][href="/surveillance"]').first(),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Navigasi pengawasan' })
      .getByRole('link', { name: 'Dark Vessel' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kapal Gelap (AIS Terputus)' }),
    ).toBeVisible();
    await expect(page.getByText('Masih gelap').first()).toBeVisible();
  });

  test('live alerts of the surveillance domain refresh the statistics', async ({ page }) => {
    await login(page);
    await page.goto('/surveillance');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ringkasan Pengawasan' }),
    ).toBeVisible();
    await expectRealtimeConnected(page);
    await waitForRealtimeRoom('authority');
    const refetch = page.waitForRequest((request) =>
      request.url().includes('/api/v2/surveillance/stats'),
    );
    await pushRealtime({
      kind: 'alert',
      alert: {
        id: '0192f0c8-7d3a-7c2e-9a1d-000000000999',
        type: 'dark',
        domain: 'surveillance',
        severity: 'warning',
        status: 'open',
        mmsi: 525019008,
        relatedMmsi: null,
        title: 'AIS gap of 525019008',
        message: 'Vessel 525019008 stopped reporting',
        lat: 1.27,
        lon: 104.01,
        zoneId: null,
        methodId: 'dark.ais_gap',
        occurredAt: new Date().toISOString(),
        lastOccurredAt: new Date().toISOString(),
        occurrences: 1,
        data: {},
      },
    });
    await refetch;
  });

  test('transhipment: replay the pair and review the event', async ({ page }) => {
    await login(page);
    await page.goto('/surveillance/transhipment');
    const table = page.getByRole('table', { name: 'Kejadian transhipment' });
    await expect(table.getByText('92,4 %')).toBeVisible();
    await table.getByRole('row').filter({ hasText: '92,4 %' }).getByText('Kritis').click();
    await expect(page).toHaveURL(/\/surveillance\/transhipment\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /KM Bahari Nusantara ↔ TB Pelita 5/ }),
    ).toBeVisible();

    // replay: the pair track loads, the scrubber and the closest approach work
    const scrubber = page.getByRole('slider', { name: 'Waktu replay' });
    await expect(scrubber).toBeEnabled();
    await page.getByRole('button', { name: 'Jarak terdekat' }).click();
    await expect(page.getByText('Jarak antarkapal').locator('..')).toContainText(/\d+\s*m/);
    await page.getByRole('button', { name: 'Putar replay' }).click();
    await expect(page.getByRole('button', { name: 'Jeda replay' })).toBeVisible();
    await page.getByRole('button', { name: 'Jeda replay' }).click();

    // review (surveillance:review: super_admin)
    await page.getByRole('radio', { name: /Konfirmasi/ }).check();
    await page.getByLabel('Catatan peninjau').fill('Dikonfirmasi patroli 22/11');
    await page.getByRole('button', { name: 'Simpan tinjauan' }).click();
    await expect(page.getByText('Tinjauan disimpan')).toBeVisible();
    await expect(page.getByText('Ditinjau: Terkonfirmasi')).toBeVisible();
    // an unchanged note is kept on the next review
    await page.getByRole('radio', { name: /Belum diputuskan/ }).check();
    await page.getByRole('button', { name: 'Simpan tinjauan' }).click();
    await expect(page.getByLabel('Catatan peninjau')).toHaveValue('Dikonfirmasi patroli 22/11');

    // Let the toasts finish (axe would otherwise judge their text mid fade-in).
    await page.mouse.move(10, 10);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
    expect(await axeViolations(page)).toEqual([]);
  });

  test('analysis results, CSV export and the historical fishing layer', async ({ page }) => {
    await login(page);
    await page.goto('/surveillance/transhipment?tab=results');
    const results = page.getByRole('table', { name: 'Hasil analisis transhipment' });
    await expect(results.getByRole('img', { name: /Rendah \d+ %/ }).first()).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ekspor CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^transhipment-results-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    await page.goto('/surveillance/fishing?tab=history');
    const history = page.getByRole('table', { name: 'Pelanggaran penangkapan ikan historis' });
    await expect(history.getByRole('row')).toHaveCount(21);
    await page.getByLabel('Tahun').click();
    await page.getByRole('option', { name: '2016' }).click();
    await expect(page).toHaveURL(/year=2016/);
    await expect(history.getByRole('row').nth(1)).toContainText('2016');
  });

  test('event detail sheet: filters, keyboard and the read-only review', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/surveillance/anomaly');
    await page.getByLabel('Tingkat').click();
    await page.getByRole('option', { name: 'Informasi' }).click();
    await expect(page).toHaveURL(/severity=info/);
    const table = page.getByRole('table', { name: 'Kejadian anomali status navigasi' });
    const row = table.getByRole('row').nth(1);
    await row.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Linimasa')).toBeVisible();
    await expect(sheet.getByText('Hanya otoritas yang dapat meninjau kejadian.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Simpan tinjauan' })).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('organization users only see events of their fleet', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/surveillance/transhipment');
    const table = page.getByRole('table', { name: 'Kejadian transhipment' });
    await expect(table.getByText('MV Combi Tanjung')).toBeVisible();
    // Hai Feng 168 ↔ Pacific Reefer: Pacific Reefer is a fleet vessel, the pair stays visible
    await expect(table.getByText('Hai Feng 168')).toBeVisible();
    await page.goto('/surveillance/dark');
    // Dong Won 701 is not a vessel of the organization
    await expect(
      page.getByRole('table', { name: 'Kejadian kapal gelap' }).getByText('Cruise Harmony'),
    ).toBeVisible();
    await expect(page.getByText('Dong Won 701')).toHaveCount(0);
  });
});

/** axe (WCAG 2.1 AA) in both themes and no horizontal page scroll at 1280/390 px on every page of both features. */
const FEATURE_PAGES = [
  '/surveillance',
  '/surveillance/transhipment',
  '/surveillance/transhipment?tab=results',
  '/surveillance/fishing',
  '/surveillance/fishing?tab=history',
  '/surveillance/dark',
  '/surveillance/anomaly',
  // pages without a nav entry: the transhipment detail and the zone editor (edit and new)
  '/surveillance/transhipment/0192f0c8-7d3a-7c2e-9a1d-000000000001',
  '/zones',
  '/zones/0192f0c8-7d3a-7c2e-9a1f-000000000002',
  '/zones/new',
];

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`surveillance and zones accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        window.localStorage.setItem(
          'ais-ui',
          JSON.stringify({ state: { theme: 'system' }, version: 1 }),
        ),
      );
    });

    test('axe and layout', async ({ page }) => {
      test.setTimeout(240_000);
      await login(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      for (const width of colorScheme === 'dark' ? [1280, 390] : [1280]) {
        await page.setViewportSize({ width, height: 844 });
        for (const path of FEATURE_PAGES) {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
          await page.waitForLoadState('networkidle');
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
          if (width === 1280) expect(await axeViolations(page), path).toEqual([]);
        }
      }
    });
  });
}
