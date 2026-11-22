import { expect, test } from '@playwright/test';

import { axeViolations, login, navigationPaths } from './fixtures';

/**
 * axe-core (WCAG 2.1 A/AA) on the login page and on every page of the sidebar, in both themes.
 * Feature pages are covered as soon as they have a nav entry; add a spec for pages without one.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`accessibility (${colorScheme} theme)`, () => {
    test.use({ colorScheme });
    test.beforeEach(async ({ page }) => {
      // Theme preference "system": the app follows the emulated colour scheme.
      await page.addInitScript(() =>
        window.localStorage.setItem(
          'ais-ui',
          JSON.stringify({ state: { theme: 'system' }, version: 1 }),
        ),
      );
    });

    test('login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      expect(await axeViolations(page)).toEqual([]);
    });

    test('every page of the sidebar', async ({ page }) => {
      test.setTimeout(180_000);
      await login(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      const paths = await navigationPaths(page);
      expect(paths.length).toBeGreaterThan(20);
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
        await page.waitForLoadState('networkidle');
        expect(await axeViolations(page), path).toEqual([]);
      }
    });
  });
}
