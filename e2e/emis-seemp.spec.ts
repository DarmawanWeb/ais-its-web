import { expect, test } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

/** Emisi & Metodologi — SEEMP: planning overview, recommendations, simulation, scenarios. */
const BAHARI = 525005223;
const year = new Date().getUTCFullYear();

test.beforeEach(() => resetMockGateway());

test('overview: planning KPIs, priorities, catalog with sources, saved scenarios', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto('/seemp');
  await expect(page.getByRole('heading', { level: 1, name: 'SEEMP' })).toBeVisible();
  await expect(page.getByText(`Kapal berperingkat D atau E pada ${year}`)).toBeVisible();

  const vessels = page.getByRole('table', { name: 'Kapal untuk SEEMP' });
  await expect(vessels.getByRole('row').filter({ hasText: 'MT Selat Jaya' })).toContainText(
    'Rencana korektif',
  );
  await expect(vessels.getByRole('row').filter({ hasText: 'KM Kepri Indah' })).toContainText(
    'Sesuai target',
  );

  await page.getByRole('tab', { name: 'Katalog langkah' }).click();
  await expect(page.getByRole('heading', { name: 'Katalog 12 langkah SEEMP' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cold ironing/ }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Skenario tersimpan' }).click();
  const scenarios = page.getByRole('table', { name: 'Skenario SEEMP tersimpan' });
  await expect(scenarios.getByText('Transisi LNG')).toBeVisible();

  // Open a vessel by MMSI.
  await page.getByRole('tab', { name: 'Kapal' }).click();
  await page.getByLabel('Buka kapal berdasarkan MMSI').fill(String(BAHARI));
  await page.getByRole('button', { name: 'Buka', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/seemp/vessels/${BAHARI}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'KM Bahari Nusantara' })).toBeVisible();
});

test('vessel: ranked recommendations, simulation with cost/benefit, save, compare, delete', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto(`/seemp/vessels/${BAHARI}`);
  const recommendations = page.getByRole('list', { name: 'Rekomendasi langkah' });
  await expect(recommendations.getByRole('listitem').first()).toBeVisible();
  await expect(recommendations.getByRole('listitem').first()).toContainText('naik');

  // Two fuel switches are incompatible (422 SEEMP_MEASURES_INCOMPATIBLE).
  await page.getByRole('checkbox', { name: /LNG untuk mesin induk dan bantu/ }).click();
  await page.getByRole('checkbox', { name: /Biofuel untuk mesin induk dan bantu/ }).click();
  await expect(
    page.getByText('LNG dan biofuel sama-sama mengganti bahan bakar: pilih salah satu saja.'),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Biofuel untuk mesin induk dan bantu/ }).click();

  // Pick a measure from the ranked list too.
  await recommendations
    .getByRole('listitem')
    .filter({ hasText: 'Pemeliharaan pelapis lambung' })
    .getByRole('checkbox')
    .click();
  await page.getByRole('button', { name: 'Simulasikan 2 langkah' }).click();
  const result = page.getByRole('region', { name: 'Hasil simulasi' });
  await expect(result).toBeVisible();
  await expect(result).toContainText('Reduksi CII');
  await expect(result).toContainText('Biaya per tahun');

  await page.getByLabel('Nama skenario').fill('Uji e2e LNG + lambung');
  await page.getByRole('button', { name: 'Simpan skenario' }).click();
  await expect(page.getByText('Skenario "Uji e2e LNG + lambung" disimpan')).toBeVisible();
  const table = page.getByRole('table', { name: 'Skenario SEEMP tersimpan' });
  await expect(table.getByText('Uji e2e LNG + lambung')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Bandingkan Uji e2e LNG + lambung' }).click();
  await page.getByRole('checkbox', { name: 'Bandingkan Transisi LNG' }).click();
  await page.getByRole('button', { name: 'Bandingkan (2)' }).click();
  const compare = page.getByRole('dialog', { name: 'Perbandingan skenario' });
  await expect(compare.getByText('Uji e2e LNG + lambung')).toBeVisible();
  await expect(compare.getByText('Transisi LNG')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Hapus skenario Uji e2e LNG + lambung' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText('Skenario "Uji e2e LNG + lambung" dihapus')).toBeVisible();
  await expect(table.getByText('Uji e2e LNG + lambung')).toHaveCount(0);
});

test('baseline and target years drive the recommendations', async ({ page }) => {
  await login(page, USERS.manager);
  await page.goto(`/seemp/vessels/${BAHARI}`);
  await expect(page.getByText(`CII dasar (${year - 1})`)).toBeVisible();
  await page.getByLabel('Tahun target').click();
  await page.getByRole('option', { name: String(Math.min(year + 2, 2030)) }).click();
  await expect(page).toHaveURL(new RegExp(`target=${Math.min(year + 2, 2030)}`));
  await expect(page.getByText(`CII disyaratkan ${Math.min(year + 2, 2030)}`)).toBeVisible();
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`SEEMP pages pass axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await login(page, USERS.manager);
    for (const path of [
      '/seemp?tab=measures',
      '/seemp?tab=scenarios',
      `/seemp/vessels/${BAHARI}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(await axeViolations(page), path).toEqual([]);
    }
  });
}

test('no horizontal page scroll at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, USERS.manager);
  for (const path of [
    '/seemp',
    '/seemp?tab=measures',
    '/seemp?tab=scenarios',
    `/seemp/vessels/${BAHARI}`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
