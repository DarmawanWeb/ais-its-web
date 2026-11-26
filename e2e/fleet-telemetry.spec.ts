import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

const MINUTE = 60_000;
const STEP = 10 * MINUTE; // the mock's meters report every 10 minutes
const JAKARTA = 7 * 60 * MINUTE; // browser time zone of the e2e project (Asia/Jakarta, UTC+7)

/** `datetime-local` value (Asia/Jakarta) of an instant. */
const localInput = (ms: number) => new Date(ms + JAKARTA).toISOString().slice(0, 16);

async function openTelemetry(page: Page) {
  await page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link', { name: 'Telemetri' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Telemetri Bahan Bakar' }),
  ).toBeVisible();
}

test.describe('fleet: telemetry', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('explores the readings of a vessel and exports them as CSV', async ({ page }) => {
    await login(page, USERS.manager);
    await openTelemetry(page);

    const picker = page.getByRole('list', { name: 'Kapal armada' });
    await picker.getByRole('button', { name: /KM Rempang/ }).click();
    await expect(page).toHaveURL(/mmsi=525019006/);
    await expect(page.getByRole('heading', { level: 2, name: 'KM Rempang' })).toBeVisible();
    await expect(picker.getByRole('button', { name: /KM Rempang/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('Total BBM', { exact: true })).toBeVisible();
    await expect(page.getByRole('figure', { name: /Grafik konsumsi bahan bakar/ })).toBeVisible();

    // 30 days default to daily buckets; hourly ones are allowed too.
    await page.getByRole('radio', { name: '30 hari' }).click();
    await expect(page).toHaveURL(/range=last30d/);
    await expect(page.getByRole('radio', { name: 'Per hari' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const table = page.getByRole('table', { name: 'Data pembacaan' });
    await expect(table.getByRole('columnheader', { name: 'Awal periode' })).toBeVisible();
    await page.getByRole('radio', { name: 'Per jam' }).click();
    await expect(page).toHaveURL(/bucket=1h/);
    // Raw readings of the last 24 hours.
    await page.getByRole('radio', { name: '24 jam' }).click();
    await page.getByRole('radio', { name: 'Mentah' }).click();
    await expect(page).toHaveURL(/bucket=raw/);
    await expect(table.getByRole('columnheader', { name: 'Sumber' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'MQTT' }).first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Ekspor CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^telemetri-525019006-raw-.+\.csv$/);
    const csv = await readFile((await download.path()) ?? '', 'utf8');
    const [header, ...rows] = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/);
    expect(header).toBe(
      'time,periodStart,fuelMeTon,fuelAeTon,totalFuelTon,readings,source,deviceId',
    );
    expect(rows.length).toBeGreaterThan(100);

    // How meters report: the MQTT topic of the contracts.
    await expect(page.getByText('aisits/telemetry/<deviceId>')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('records a manual reading after a conflict at a stored instant', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/telemetry?mmsi=525019006&range=last24h&bucket=raw');
    await expect(page.getByRole('heading', { level: 2, name: 'KM Rempang' })).toBeVisible();

    await page.getByRole('button', { name: 'Input manual' }).click();
    const dialog = page.getByRole('dialog', { name: 'Input pembacaan manual' });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('reading-save').click();
    await expect(dialog.getByText('Wajib diisi').first()).toBeVisible();

    // The meter of KM Rempang already reported at every 10-minute mark.
    const stored = Math.floor((Date.now() - 2 * 60 * MINUTE) / STEP) * STEP;
    await dialog.getByLabel('Waktu pembacaan').fill(localInput(stored));
    await dialog.getByLabel('Bahan bakar mesin utama').fill('0.5');
    await dialog.getByLabel('Bahan bakar mesin bantu').fill('0.05');
    await dialog.getByTestId('reading-save').click();
    await expect(dialog.getByText(/Sudah ada pembacaan berbeda pada waktu ini/)).toBeVisible();
    await expect(dialog.getByLabel('Waktu pembacaan')).toBeFocused();

    await dialog.getByLabel('Waktu pembacaan').fill(localInput(stored + 3 * MINUTE));
    await dialog.getByTestId('reading-save').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Pembacaan disimpan')).toBeVisible();
    const table = page.getByRole('table', { name: 'Data pembacaan' });
    await expect(table.getByRole('cell', { name: 'Manual' })).toBeVisible();
  });

  test('organization admins see the devices of a vessel with a link to manage them', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // The administrator signs in to the platform organization; the demo fleet is another one.
    await page.getByTestId('org-switcher').click();
    await page.getByRole('menuitem', { name: /PT Pelayaran Nusantara/ }).click();
    await expect(page.getByTestId('org-switcher')).toContainText('PT Pelayaran Nusantara');
    await openTelemetry(page);
    await page
      .getByRole('list', { name: 'Kapal armada' })
      .getByRole('button', { name: /KM Rempang/ })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: 'KM Rempang' })).toBeVisible();
    const devices = page.locator('section', {
      has: page.getByRole('heading', { level: 2, name: 'Perangkat' }),
    });
    await expect(devices.getByRole('link', { name: /Kelola perangkat/ })).toHaveAttribute(
      'href',
      '/admin/devices',
    );
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`passes axe and fits a phone without horizontal scroll (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem(
          'ais-ui',
          JSON.stringify({ state: { theme: value }, version: 1 }),
        );
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await login(page, USERS.manager);
      await page.goto('/telemetry?mmsi=525019008');
      await expect(page.getByRole('heading', { level: 2, name: 'Cruise Harmony' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await axeViolations(page), theme).toEqual([]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
