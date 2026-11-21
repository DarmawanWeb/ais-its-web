import { expect, test, type Page } from '@playwright/test';

import { login } from './fixtures';

const DIR = 'docs/screenshots';

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

test.describe('documentation screenshots', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/login.png` });
  });

  test('dashboard shell (dark and light)', async ({ page }) => {
    await login(page);
    await settle(page);
    await page.screenshot({ path: `${DIR}/dashboard-dark.png` });
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.mouse.move(700, 600);
    await settle(page);
    await page.screenshot({ path: `${DIR}/dashboard-light.png` });
    await page.getByTestId('theme-toggle').click();
  });

  test('live map with the basemap fallback', async ({ page }) => {
    await login(page);
    await page.goto('/map');
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByTestId('vessel-count')).not.toHaveText('0');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${DIR}/map.png` });
  });

  test('mobile shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await settle(page);
    await page.screenshot({ path: `${DIR}/dashboard-mobile.png` });
  });
});
