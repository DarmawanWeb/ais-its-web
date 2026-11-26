import { expect, test, type Page } from '@playwright/test';

import { login, resetMockGateway, USERS } from './fixtures';

/**
 * Documentation screenshots of the emission & methodology pages (CII, SEEMP, methodology) in
 * both themes at 1440×900, plus 390×844 for the main page of each feature:
 * docs/screenshots/<feature>-<page>-<variant>.png. Runs in the `screenshots` project only
 * (`pnpm screenshots`), like e2e/screenshots.spec.ts.
 */
const DIR = 'docs/screenshots';
const THEMES = ['dark', 'light'] as const;
const BAHARI = 525005223;

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function settle(page: Page, ms = 700) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await settle(page);
}

test.describe('emission & methodology screenshots', () => {
  test.beforeEach(() => resetMockGateway());

  for (const theme of THEMES) {
    test(`CII (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);

      await open(page, '/cii', 'Emisi & CII');
      await page.screenshot({ path: `${DIR}/cii-fleet-${theme}.png` });

      await open(page, `/cii/vessels/${BAHARI}`, 'KM Bahari Nusantara');
      await expect(page.getByRole('img', { name: /Skala peringkat CII/ })).toBeVisible();
      await page.screenshot({ path: `${DIR}/cii-vessel-${theme}.png` });

      // Daily curve against the A–E bands, below the fold of the summary.
      await page
        .getByRole('figure', { name: /CII kumulatif|Kurva/ })
        .first()
        .scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 260);
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/cii-vessel-daily-${theme}.png` });

      await open(page, '/cii/vessels/525019009?tab=history', 'MV Combi Tanjung');
      await expect(page.getByRole('table', { name: 'Riwayat CII tahunan' })).toBeVisible();
      await page.screenshot({ path: `${DIR}/cii-history-${theme}.png` });

      await open(page, `/cii/vessels/${BAHARI}?tab=segments`, 'KM Bahari Nusantara');
      await expect(page.getByRole('table', { name: 'Segmen pelayaran' })).toBeVisible();
      await page.screenshot({ path: `${DIR}/cii-segments-${theme}.png` });

      await open(page, `/cii/vessels/${BAHARI}?tab=dcs`, 'KM Bahari Nusantara');
      await page.screenshot({ path: `${DIR}/cii-dcs-${theme}.png` });

      await open(page, '/cii/reduction-factors', 'Faktor reduksi Z');
      await page.screenshot({ path: `${DIR}/cii-factors-${theme}.png` });
    });

    test(`SEEMP (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);

      await open(page, '/seemp', 'SEEMP');
      await page.screenshot({ path: `${DIR}/seemp-overview-${theme}.png` });

      await open(page, '/seemp?tab=measures', 'SEEMP');
      await page.screenshot({ path: `${DIR}/seemp-catalog-${theme}.png` });

      await open(page, `/seemp/vessels/${BAHARI}`, 'KM Bahari Nusantara');
      const recommendations = page.getByRole('list', { name: 'Rekomendasi langkah' });
      await recommendations.getByRole('listitem').nth(0).getByRole('checkbox').click();
      await recommendations.getByRole('listitem').nth(3).getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Simulasikan 2 langkah' }).click();
      await expect(page.getByRole('region', { name: 'Hasil simulasi' })).toBeVisible();
      // Back to the top: picking the 4th measure scrolled the page.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.getElementById('main-content')?.scrollTo(0, 0);
      });
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/seemp-vessel-${theme}.png` });

      await page.getByRole('region', { name: 'Hasil simulasi' }).scrollIntoViewIfNeeded();
      await settle(page, 300);
      await page.screenshot({ path: `${DIR}/seemp-simulation-${theme}.png` });

      await open(page, '/seemp?tab=scenarios', 'SEEMP');
      await page.getByRole('checkbox', { name: 'Bandingkan Transisi LNG' }).click();
      await page.getByRole('checkbox', { name: 'Bandingkan Paket teknis hemat' }).click();
      await page.getByRole('button', { name: 'Bandingkan (2)' }).click();
      await expect(page.getByRole('dialog', { name: 'Perbandingan skenario' })).toBeVisible();
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/seemp-compare-${theme}.png` });
    });

    test(`methodology (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);

      await open(page, '/methodology', 'Metodologi & Referensi');
      await page.screenshot({ path: `${DIR}/methodology-catalog-${theme}.png` });

      await page.goto('/methodology#cii.rating_grade');
      await expect(page.locator('[id="cii.rating_grade"]')).toBeInViewport();
      await settle(page, 500);
      await page.screenshot({ path: `${DIR}/methodology-method-${theme}.png` });

      await page.goto('/methodology#bibliography');
      await expect(page.getByRole('region', { name: 'Pustaka' })).toBeVisible();
      await settle(page, 500);
      await page.screenshot({ path: `${DIR}/methodology-bibliography-${theme}.png` });
    });
  }

  test('main pages on a phone (390×844)', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.admin);

    await open(page, '/cii', 'Emisi & CII');
    await page.screenshot({ path: `${DIR}/cii-fleet-mobile.png` });

    await open(page, '/seemp', 'SEEMP');
    await page.screenshot({ path: `${DIR}/seemp-overview-mobile.png` });

    await open(page, '/methodology', 'Metodologi & Referensi');
    await page.screenshot({ path: `${DIR}/methodology-catalog-mobile.png` });
  });
});
