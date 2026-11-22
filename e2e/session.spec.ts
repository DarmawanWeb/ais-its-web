import { expect, test, type Page } from '@playwright/test';

import { login } from './fixtures';

const unavailable = {
  status: 503,
  contentType: 'application/problem+json',
  body: JSON.stringify({ status: 503, code: 'UNAVAILABLE', title: 'Service unavailable' }),
};

async function signOut(page: Page) {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe('session', () => {
  test('a sign-out the server did not receive is reported and never restored', async ({
    page,
    context,
  }) => {
    await login(page);
    await context.route('**/api/v2/auth/logout', (route) => route.fulfill(unavailable));
    await signOut(page);
    await expect(page.getByText('Keluar belum selesai')).toBeVisible();

    // Another tab must not sign the previous user back in from the refresh cookie.
    const other = await context.newPage();
    const refreshes: string[] = [];
    other.on('request', (request) => {
      if (request.url().includes('/api/v2/auth/refresh')) refreshes.push(request.url());
    });
    await other.goto('/dashboard');
    await expect(other).toHaveURL(/\/login/);
    await expect(other.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
    expect(refreshes).toEqual([]);

    // The service is back: the retry (button, or the background retry) revokes the family.
    await context.unroute('**/api/v2/auth/logout');
    await page
      .getByRole('button', { name: 'Coba lagi' })
      .click({ timeout: 2_000 })
      .catch(() => undefined);
    await expect(page.getByText('Sesi sebelumnya telah dicabut di server.')).toBeVisible({
      timeout: 20_000,
    });
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'aisits_rt')).toBeUndefined();
    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    await other.close();
  });

  test('a refresh in flight during sign-out does not bring the session back', async ({
    page,
    context,
  }) => {
    await login(page);
    // The next refresh takes 1.5 s; a 401 on the map's REST seed starts one.
    await context.route('**/api/v2/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    let rejected = false;
    await page.route('**/api/v2/ais/latest**', async (route) => {
      if (rejected) return route.continue();
      rejected = true;
      return route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 401, code: 'UNAUTHORIZED', title: 'Unauthorized' }),
      });
    });
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('link', { name: 'Peta Live' })
      .click();
    await expect.poll(() => rejected).toBe(true);
    await page.waitForTimeout(300);
    await signOut(page);
    await page.waitForTimeout(2_500);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('user-menu')).toHaveCount(0);
  });

  for (const target of ['%2F%5Cexample.org', '%2F%09%2Fexample.org', '%2F%2Fexample.org']) {
    test(`post-login redirect ${target} stays on the console`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/login?redirect=${target}`);
      await login(page, undefined, { navigate: false });
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(errors).toEqual([]);
    });
  }

  test('the command palette moves focus to the new page', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').getByRole('combobox').fill('peta');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/map$/);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content');
  });
});
