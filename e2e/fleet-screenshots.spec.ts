import { expect, test, type Page } from '@playwright/test';

import { login, resetMockGateway, USERS } from './fixtures';

/**
 * Documentation screenshots of the fleet & telemetry pages (dashboard, vessels, telemetry) in
 * both themes at 1440×900, plus 390×844 for the main page of each feature:
 * docs/screenshots/<feature>-<page>-<variant>.png. Runs in the `screenshots` project only
 * (`pnpm screenshots`), like e2e/screenshots.spec.ts.
 */
const DIR = 'docs/screenshots';
const THEMES = ['dark', 'light'] as const;

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function settle(page: Page, ms = 800) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function openDashboard(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard Armada' })).toBeVisible();
  await expect(page.getByTestId('dashboard-live')).toHaveText('Realtime terhubung');
  // Two samples of the AIS rate (one every 15 s) so the rate chart has a line.
  await page.waitForTimeout(16_000);
  await settle(page, 1500);
}

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  // No focus ring of the clicked tab in the picture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page, 1500);
}

test.describe('fleet & telemetry screenshots', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  for (const theme of THEMES) {
    test(`dashboard (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.manager);
      await openDashboard(page);
      await page.screenshot({ path: `${DIR}/dashboard-overview-${theme}.png` });
    });

    test(`vessels (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.manager);

      await page.goto('/vessels');
      await expect(page.getByRole('table', { name: 'Daftar kapal' })).toBeVisible();
      await settle(page, 1500);
      await page.screenshot({ path: `${DIR}/vessels-list-${theme}.png` });

      await page.goto('/vessels/525005223');
      await expect(
        page.getByRole('heading', { level: 1, name: 'KM Bahari Nusantara' }),
      ).toBeVisible();
      await settle(page, 1500);
      await page.screenshot({ path: `${DIR}/vessels-detail-${theme}.png` });
      await openTab(page, 'Live');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${DIR}/vessels-detail-live-${theme}.png` });
      await openTab(page, 'CII');
      await page.screenshot({ path: `${DIR}/vessels-detail-cii-${theme}.png` });

      await page.goto('/vessels/525019008');
      await expect(page.getByRole('heading', { level: 1, name: 'Cruise Harmony' })).toBeVisible();
      await openTab(page, 'Telemetri');
      await page
        .getByRole('heading', { level: 2, name: 'Konsumsi harian' })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/vessels-detail-telemetry-${theme}.png` });

      await page.goto('/vessels/new');
      await expect(page.getByRole('heading', { level: 1, name: 'Tambah Kapal' })).toBeVisible();
      await page.getByRole('button', { name: 'Isi dari registri' }).click();
      const registry = page.getByRole('dialog');
      await registry.getByLabel('Kata kunci registri').fill('km');
      await expect(registry.getByRole('button', { name: /KM SEGARA BIRU/ })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/vessels-registry-${theme}.png` });
      await registry.getByRole('button', { name: /KM SEGARA BIRU/ }).click();
      await expect(page.getByText(/kolom diisi dari registri/)).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page);
      await page.screenshot({ path: `${DIR}/vessels-new-${theme}.png` });

      await page.goto('/vessels/525005223/edit');
      await expect(page.getByRole('heading', { level: 1, name: 'Ubah Data Kapal' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/vessels-edit-${theme}.png` });
    });

    test(`telemetry (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.manager);
      await page.goto('/telemetry?mmsi=525019008');
      await expect(page.getByRole('heading', { level: 2, name: 'Cruise Harmony' })).toBeVisible();
      await expect(page.getByRole('figure', { name: /Grafik konsumsi bahan bakar/ })).toBeVisible();
      await settle(page, 1500);
      await page.screenshot({ path: `${DIR}/telemetry-explorer-${theme}.png` });

      await page.getByRole('button', { name: 'Input manual' }).click();
      const dialog = page.getByRole('dialog', { name: 'Input pembacaan manual' });
      await dialog.getByLabel('Bahan bakar mesin utama').fill('0.042');
      await dialog.getByLabel('Bahan bakar mesin bantu').fill('0.006');
      await settle(page);
      await page.screenshot({ path: `${DIR}/telemetry-manual-${theme}.png` });
    });
  }

  test('main pages on a phone (390×844)', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.manager);
    await openDashboard(page);
    await page.screenshot({ path: `${DIR}/dashboard-overview-mobile.png` });

    await page.goto('/vessels');
    await expect(page.getByRole('table', { name: 'Daftar kapal' })).toBeVisible();
    await settle(page, 1500);
    await page.screenshot({ path: `${DIR}/vessels-list-mobile.png` });

    await page.goto('/telemetry?mmsi=525019008');
    await expect(page.getByRole('heading', { level: 2, name: 'Cruise Harmony' })).toBeVisible();
    await settle(page, 1500);
    await page.screenshot({ path: `${DIR}/telemetry-explorer-mobile.png` });
  });
});
