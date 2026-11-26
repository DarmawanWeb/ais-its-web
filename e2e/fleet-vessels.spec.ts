import { expect, test, type Page } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

/** A 1×1 PNG (valid magic bytes) for the photo upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function useTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function expectSinglePageLayout(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

async function fill(page: Page, label: string | RegExp, value: string) {
  const input = page.getByLabel(label, { exact: typeof label === 'string' });
  await input.fill(value);
}

test.describe('fleet: vessels', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('search, open a vessel, browse its tabs and edit it', async ({ page }) => {
    await login(page, USERS.manager);
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .getByRole('link', { name: 'Kapal' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kapal' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Daftar kapal' });
    await expect(table.getByText('KM Bahari Nusantara')).toBeVisible();
    // Default scope: the manager's fleet only (the Singapore vessel belongs to another company).
    await expect(table.getByText('Lion City Spirit')).toHaveCount(0);

    await page.getByLabel('Cari kapal berdasarkan nama, MMSI atau IMO').fill('Kepri');
    await expect(page).toHaveURL(/q=Kepri/);
    await expect(table.getByRole('row')).toHaveCount(2);
    await table.getByText('KM Kepri Indah').click();

    await expect(page).toHaveURL(/\/vessels\/525019003$/);
    await expect(page.getByRole('heading', { level: 1, name: 'KM Kepri Indah' })).toBeVisible();
    await expect(page.getByText('Armada Anda')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mesin' })).toBeVisible();
    await page.getByRole('tab', { name: 'Live' }).click();
    await expect(page.getByRole('heading', { name: 'Posisi terakhir' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Lintasan di peta/ })).toHaveAttribute(
      'href',
      /\/map\?vessel=525019003/,
    );
    await page.getByRole('tab', { name: 'Alert' }).click();
    await expect(page.getByRole('heading', { name: 'Alert kapal' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole('link', { name: 'Ubah', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ubah Data Kapal' })).toBeVisible();
    await fill(page, 'Nama kapal', 'KM Kepri Indah II');
    await fill(page, 'Kecepatan dinas (Vs)', '13');
    await page.getByTestId('vessel-save').click();
    await expect(page).toHaveURL(/\/vessels\/525019003$/);
    await expect(page.getByRole('heading', { level: 1, name: 'KM Kepri Indah II' })).toBeVisible();
    await expect(page.getByText('Perubahan KM Kepri Indah II disimpan')).toBeVisible();
    await expect(page.getByText('13,0').first()).toBeVisible();
  });

  test('creates a vessel from the registry with a photo, then deletes it', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/vessels/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Tambah Kapal' })).toBeVisible();
    // Nothing is sent before the required fields are valid.
    await page.getByTestId('vessel-save').click();
    await expect(page.getByText('Wajib diisi').first()).toBeVisible();

    await page.getByRole('button', { name: 'Isi dari registri' }).click();
    const registry = page.getByRole('dialog');
    await registry.getByLabel('Kata kunci registri').fill('segara');
    await registry.getByRole('button', { name: /KM SEGARA BIRU/ }).click();
    await expect(page.getByText(/kolom diisi dari registri/)).toBeVisible();
    await expect(page.getByLabel('Nama kapal', { exact: true })).toHaveValue('KM SEGARA BIRU');
    await expect(page.getByRole('spinbutton', { name: 'MMSI' })).toHaveValue('525019100');

    await page.getByRole('combobox', { name: 'Bahan bakar', exact: true }).click();
    await page.getByRole('option', { name: 'Diesel / gas oil' }).click();
    await fill(page, 'Porsi tahun berlayar', '60');
    await fill(page, /Kapasitas CII/, '6100');
    for (const [label, value] of [
      ['Panjang antar garis tegak (LPP)', '92'],
      ['Panjang garis air (LWL)', '94'],
      ['Kecepatan dinas (Vs)', '12'],
      ['Koefisien blok C_B', '0.7'],
      ['Koefisien blok C_bnsp', '0.7'],
      ['Koefisien prismatik C_P', '0.72'],
      ['Koefisien gading tengah C_M', '0.98'],
      ['Koefisien bidang air C_WP', '0.8'],
      ['Koefisien buritan C_stern', '0'],
      ['Faktor c1 (tipe kapal)', '1'],
      ['Faktor c2 (tipe kemudi)', '1'],
      ['Faktor c3 (profil kemudi)', '1'],
      ['Faktor c5 (susunan kemudi)', '1.5'],
    ] as const) {
      await fill(page, label, value);
    }
    await page
      .getByLabel('Pilih foto kapal')
      .setInputFiles({ name: 'segara.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Foto diunggah setelah kapal tersimpan.')).toBeVisible();
    await page.getByTestId('vessel-save').click();

    await expect(page).toHaveURL(/\/vessels\/525019100$/);
    await expect(page.getByRole('heading', { level: 1, name: 'KM SEGARA BIRU' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Foto kapal KM SEGARA BIRU' })).toBeVisible();
    await expect(page.getByText('Tanker').first()).toBeVisible();

    await page.getByRole('button', { name: 'Hapus' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText('Hapus KM SEGARA BIRU?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Hapus kapal' }).click();
    await expect(page).toHaveURL(/\/vessels$/);
    await expect(page.getByText('KM SEGARA BIRU dihapus')).toBeVisible();
  });

  test('another organization’s vessel shows its identity only', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/vessels/563012345');
    await expect(page.getByRole('heading', { level: 1, name: 'Lion City Spirit' })).toBeVisible();
    await expect(page.getByText('Data teknis bersifat privat')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ubah', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'CII' })).toHaveCount(0);
    await page.goto('/vessels/563012345/edit');
    await expect(page.getByText('Kapal ini milik organisasi lain')).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`list, detail and form pages pass axe and fit 390 px (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await login(page, USERS.manager);
      for (const path of [
        '/vessels',
        '/vessels/525005223',
        '/vessels/new',
        '/vessels/525005223/edit',
      ]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await axeViolations(page), `${path} (${theme})`).toEqual([]);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await expectSinglePageLayout(page);
      }
    });
  }
});
