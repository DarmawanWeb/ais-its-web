import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshots of the shell (`pnpm screenshots` runs every `*screenshots.spec.ts`): the pages of
 * the features are captured by their own specs (`e2e/<group>-screenshots.spec.ts`), the
 * gallery is docs/SCREENSHOTS.md.
 */
const DIR = 'docs/screenshots';

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

test.describe('documentation screenshots (shell)', () => {
  test('login page (desktop and mobile)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/login.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await page.screenshot({ path: `${DIR}/login-mobile.png` });
  });
});
