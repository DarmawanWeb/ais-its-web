import { expect, test, type Page } from '@playwright/test';

import { login, resetMockGateway } from './fixtures';

/**
 * Documentation screenshots of the surveillance and zones features (`pnpm screenshots`; the
 * file name ends with `screenshots.spec.ts`, so the e2e project skips it):
 * docs/screenshots/<feature>-<page>-<variant>.png, every page in the dark and the light theme at
 * 1440×900, the main page of each feature also at 390×844.
 */
const DIR = 'docs/screenshots';

async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  // react-router's ScrollRestoration keys every initial load "default", so a full navigation
  // restores the previous page's scroll position: start every capture at the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(ms);
}

const PAGES: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'surveillance-overview',
    open: async (page) => {
      await page.goto('/surveillance');
      await expect(page.getByRole('figure', { name: /Jumlah kejadian per jenis/ })).toBeVisible();
    },
  },
  {
    name: 'surveillance-transhipment',
    open: async (page) => {
      await page.goto('/surveillance/transhipment');
      await expect(
        page.getByRole('table', { name: 'Kejadian transhipment' }).getByText('92,4 %'),
      ).toBeVisible();
    },
  },
  {
    name: 'surveillance-transhipment-detail',
    open: async (page) => {
      await page.goto('/surveillance/transhipment');
      const table = page.getByRole('table', { name: 'Kejadian transhipment' });
      await table.getByRole('row').filter({ hasText: '92,4 %' }).getByText('Kritis').click();
      await expect(page.getByRole('slider', { name: 'Waktu replay' })).toBeEnabled();
      await page.getByRole('button', { name: 'Jarak terdekat' }).click();
    },
  },
  {
    name: 'surveillance-fishing',
    open: async (page) => {
      await page.goto('/surveillance/fishing');
      await expect(page.getByText(/Peta panas \d+ kejadian/)).toBeVisible();
    },
  },
  {
    name: 'surveillance-dark',
    open: async (page) => {
      await page.goto('/surveillance/dark');
      await expect(page.getByText('Masih gelap').first()).toBeVisible();
    },
  },
  {
    name: 'surveillance-anomaly',
    open: async (page) => {
      await page.goto('/surveillance/anomaly');
      await expect(
        page.getByRole('table', { name: 'Kejadian anomali status navigasi' }),
      ).toBeVisible();
    },
  },
  {
    name: 'zones-registry',
    open: async (page) => {
      await page.goto('/zones');
      await expect(
        page.getByRole('table', { name: 'Daftar zona' }).getByText('Area terlarang Batu Ampar'),
      ).toBeVisible();
    },
  },
  {
    name: 'zones-editor',
    open: async (page) => {
      await page.goto('/zones/0192f0c8-7d3a-7c2e-9a1f-000000000002');
      await expect(page.getByLabel('Nama')).toHaveValue('Area transhipment Batam');
    },
  },
];

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`surveillance and zones screenshots (${colorScheme})`, () => {
    test.use({ colorScheme, viewport: { width: 1440, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await resetMockGateway();
      await page.addInitScript(() =>
        window.localStorage.setItem(
          'ais-ui',
          JSON.stringify({ state: { theme: 'system' }, version: 1 }),
        ),
      );
    });

    test('every page', async ({ page }) => {
      test.setTimeout(240_000);
      await login(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      for (const item of PAGES) {
        await item.open(page);
        await settle(page);
        await page.mouse.move(1430, 890);
        await page.screenshot({ path: `${DIR}/${item.name}-${colorScheme}.png` });
      }
    });
  });
}

test.describe('surveillance and zones screenshots (mobile)', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 390, height: 844 } });

  test('main pages at 390 px', async ({ page }) => {
    test.setTimeout(120_000);
    await resetMockGateway();
    await login(page);
    for (const item of PAGES.filter(
      (entry) => entry.name === 'surveillance-overview' || entry.name === 'zones-registry',
    )) {
      await item.open(page);
      await settle(page);
      await page.screenshot({ path: `${DIR}/${item.name}-mobile.png` });
    }
  });
});
