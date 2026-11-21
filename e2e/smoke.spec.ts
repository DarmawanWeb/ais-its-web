import { expect, test } from '@playwright/test';

import { login, USERS } from './fixtures';

test.describe('smoke', () => {
  test('login, shell, navigation, session restore and logout', async ({ page }) => {
    // Anonymous visitors land on the login page.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText('Intelijen maritim real-time untuk perairan Indonesia'),
    ).toBeVisible();

    // Wrong password: problem details message.
    await page.getByLabel('Email').fill(USERS.admin.email);
    await page.getByLabel('Kata sandi', { exact: true }).fill('salah-sekali-1');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByTestId('login-error')).toContainText('Email atau kata sandi salah.');

    await login(page);

    // Shell: sections of the sidebar and the top bar controls.
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    for (const section of [
      'Operasi',
      'Keselamatan',
      'Pengawasan',
      'Armada',
      'Pengaturan',
      'Pengetahuan',
    ]) {
      await expect(nav.getByText(section, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId('org-switcher')).toContainText('AIS Maritime Intelligence');

    // Navigate through the sidebar.
    await nav.getByRole('link', { name: 'Metodologi & Referensi' }).click();
    await expect(page).toHaveURL(/\/methodology$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Metodologi & Referensi' }),
    ).toBeVisible();
    await expect(page.getByText(/\d+ metode/)).toBeVisible();

    await nav.getByRole('link', { name: 'EWS Pipa' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Peringatan Dini Pipa Bawah Laut' }),
    ).toBeVisible();

    // Live map: MapLibre container and live vessels from the REST seed.
    await nav.getByRole('link', { name: 'Peta Live' }).click();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByTestId('vessel-count')).not.toHaveText('0');

    // Command palette (Ctrl+K): pages and vessel search.
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog');
    await palette.getByRole('combobox').fill('Emisi');
    await palette.getByRole('option', { name: 'Emisi & CII' }).click();
    await expect(page).toHaveURL(/\/cii$/);

    // Reload: the session is restored from the refresh cookie (token kept in memory only).
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Emisi & CII' })).toBeVisible();
    const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(stored).not.toContain('eyJ');

    // Language switch.
    await page.getByTestId('language-toggle').click();
    await page.getByRole('menuitem', { name: /English/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Emissions & CII' })).toBeVisible();
    await page.getByTestId('language-toggle').click();
    await page.getByRole('menuitem', { name: /Bahasa Indonesia/ }).click();

    // Logout.
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
  });

  test('permissions hide what a fleet manager may not use', async ({ page }) => {
    await login(page, USERS.manager);
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await expect(nav.getByRole('link', { name: 'Telemetri' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Organisasi' })).toHaveCount(0);
    await page.goto('/admin/organizations');
    await expect(page.locator('#main-content').getByText('Akses ditolak')).toBeVisible();
    await page.goto('/halaman-tidak-ada');
    await expect(page.locator('#main-content').getByText('Halaman tidak ditemukan')).toBeVisible();
  });
});
