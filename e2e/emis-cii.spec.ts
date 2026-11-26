import { expect, test } from '@playwright/test';

import {
  axeViolations,
  expectRealtimeConnected,
  login,
  pushRealtime,
  resetMockGateway,
  USERS,
  waitForRealtimeRoom,
} from './fixtures';

/** Emisi & Metodologi — CII: fleet summary, vessel detail, manual records, DCS, recompute, Z. */
const FLEET_ORG_ID = '0192f0c8-7d3a-7c2e-9a1b-000000000001';
const BAHARI = 525005223;
const year = new Date().getUTCFullYear();

test.beforeEach(() => resetMockGateway());

test('fleet summary: KPIs, grade distribution, table and navigation to a vessel', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto('/cii');
  await expect(page.getByRole('heading', { level: 1, name: 'Emisi & CII' })).toBeVisible();
  await expect(page.getByText('Kapal dalam armada')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Distribusi peringkat ${year}` })).toBeVisible();

  const table = page.getByRole('table', { name: `CII kapal armada tahun ${year}` });
  const row = table.getByRole('row').filter({ hasText: 'KM Bahari Nusantara' });
  await expect(row).toContainText('Sedang');
  await expect(row).toContainText('0,950');
  await expect(row).toContainText('Membaik');

  // Table view of the distribution (identity never by colour alone).
  await page.getByRole('button', { name: 'Tabel' }).first().click();
  const distribution = page.getByRole('table', { name: /kapal berperingkat/ });
  await expect(distribution.getByRole('cell', { name: /Sangat unggul/ })).toBeVisible();

  // Manager: no platform-admin actions.
  await expect(page.locator('#cii-org')).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/cii/vessels/${BAHARI}`));
  await expect(page.getByRole('heading', { level: 1, name: 'KM Bahari Nusantara' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hitung ulang' })).toHaveCount(0);
});

test('vessel detail: figures with method sources, rating scale, daily curve, live update', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto(`/cii/vessels/${BAHARI}`);
  await expect(page.getByRole('heading', { level: 1, name: 'KM Bahari Nusantara' })).toBeVisible();
  await expect(page.getByText('CII tercapai').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Skala peringkat CII: tercapai/ })).toBeVisible();
  await expect(page.getByRole('figure', { name: /CII kumulatif/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proyeksi akhir tahun' })).toBeVisible();
  // Holtrop (weather-derived) figures carry the Open-Meteo attribution.
  await expect(
    page.getByRole('link', { name: 'Data cuaca oleh Open-Meteo.com' }).first(),
  ).toBeVisible();

  // ⓘ source popover → methodology deep link (named by id until the catalog is loaded).
  await page
    .getByRole('button', { name: /^Sumber metode: (cii\.attained_accumulation|CII attained)/ })
    .first()
    .click();
  await page.getByRole('link', { name: 'Buka di Metodologi & Referensi' }).click();
  await expect(page).toHaveURL(/\/methodology#cii\.attained_accumulation$/);
  await expect(page.locator('[id="cii.attained_accumulation"]')).toBeInViewport();

  // cii:updated of the vessel's organization refreshes the page.
  await page.goto(`/cii/vessels/${BAHARI}`);
  await expectRealtimeConnected(page);
  await waitForRealtimeRoom(`org:${FLEET_ORG_ID}`);
  await pushRealtime({
    kind: 'cii:updated',
    update: {
      mmsi: BAHARI,
      vesselId: '0192f0c8-7d3a-7c2e-9a1b-000525005223',
      orgId: FLEET_ORG_ID,
      year,
      asOf: new Date().toISOString(),
      distanceNm: 52000,
      fuelMeTon: 4300,
      fuelAeTon: 700,
      co2Ton: 15200,
      attained: 6.44,
      required: 6.77,
      rating: 0.95,
      grade: 'C',
      lastMethod: 'holtrop',
    },
  });
  await expect(page.getByRole('status').filter({ hasText: /Diperbarui/ })).toBeVisible();
});

test('annual history with manual records: flag, add a record, editor validation', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto(`/cii/vessels/525019009?tab=history`);
  const history = page.getByRole('table', { name: 'Riwayat CII tahunan' });
  await expect(history.getByRole('row').filter({ hasText: '2023' })).toContainText('Manual');

  await page.getByRole('button', { name: 'Tambah catatan manual' }).click();
  const dialog = page.getByRole('dialog', { name: 'Catatan CII manual / impor' });
  await dialog.getByLabel('Tahun').click();
  await page.getByRole('option', { name: String(year - 1) }).click();
  await expect(dialog.getByText('Catatan baru')).toBeVisible();
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog.getByText('Wajib diisi').first()).toBeVisible();

  await dialog.getByLabel(/CII tercapai/).fill('7,1');
  await dialog.getByLabel(/^Jarak/).fill('50000');
  await dialog.getByLabel(/BBM ME/).fill('3000');
  await dialog.getByLabel(/BBM AE/).fill('400');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText(`Catatan manual ${year - 1} disimpan`)).toBeVisible();
  await expect(history.getByRole('row').filter({ hasText: String(year - 1) })).toContainText(
    'Manual',
  );
  await expect(history.getByRole('row').filter({ hasText: String(year - 1) })).toContainText(
    '7,10',
  );
});

test('segments, DCS report and CSV download', async ({ page }) => {
  await login(page, USERS.manager);
  await page.goto(`/cii/vessels/${BAHARI}?tab=segments`);
  const segments = page.getByRole('table', { name: 'Segmen pelayaran' });
  await expect(segments.getByText('Holtrop + cuaca').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data cuaca oleh Open-Meteo.com' })).toBeVisible();
  // 24 h hold one page (48 segments of 30 min): the last 7 days need the cursor.
  await expect(page.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
  await page.getByRole('button', { name: /^Rentang segmen: / }).click();
  await page.getByRole('button', { name: '7 hari terakhir' }).click();
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();
  await expect(segments.getByRole('row')).not.toHaveCount(1);

  await page.getByRole('tab', { name: 'Laporan DCS' }).click();
  const fuel = page.getByRole('table', { name: `Bahan bakar per jenis ${year}` });
  await expect(fuel.getByText('Heavy fuel oil (HFO)')).toBeVisible();
  // The mock gateway only serves JSON bodies: fulfil the CSV request like the service would.
  await page.route('**/api/v2/emission/vessels/*/dcs*', async (route) => {
    const accept = route.request().headers()['accept'] ?? '';
    if (!accept.includes('text/csv')) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body: 'year,mmsi,fuel_code\r\n2026,525005223,HFO\r\n',
    });
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh CSV' }).click();
  expect((await download).suggestedFilename()).toBe(`dcs-${BAHARI}-${year}.csv`);
  await expect(page.getByText(`Ringkasan DCS ${year} diunduh`)).toBeVisible();
});

test('tenancy and missing data: CII_NOT_AVAILABLE explains what to do', async ({ page }) => {
  await login(page, USERS.manager);
  await page.goto('/cii/vessels/525019004');
  await expect(page.getByText(`Belum ada data CII untuk ${year}`)).toBeVisible();
  await expect(page.getByRole('button', { name: `Isi catatan manual ${year}` })).toBeVisible();
});

test('platform admin: recompute job and reduction factor editor', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto(`/cii/vessels/${BAHARI}`);
  await page.getByRole('button', { name: 'Hitung ulang' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hitung ulang segmen' });
  await dialog.getByRole('button', { name: 'Mulai hitung ulang' }).click();
  const job = page.getByRole('region', { name: 'Pekerjaan hitung ulang' });
  await expect(job.getByText('Berhasil')).toBeVisible({ timeout: 15_000 });

  await page.goto('/cii/reduction-factors');
  await expect(page.getByRole('heading', { level: 1, name: 'Faktor reduksi Z' })).toBeVisible();
  await page.getByRole('button', { name: 'Ubah faktor' }).click();
  const editor = page.getByRole('dialog', { name: 'Ubah faktor reduksi Z' });
  await editor.getByLabel('Z tahun 2030 (%)').fill('22');
  await expect(editor.getByText('1 perubahan siap disimpan')).toBeVisible();
  await editor.getByRole('button', { name: 'Simpan' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Simpan & publikasikan ulang' })
    .click();
  await expect(page.getByText('1 faktor reduksi disimpan')).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Faktor reduksi per tahun' })
      .getByRole('row')
      .filter({ hasText: '2030' }),
  ).toContainText('22%');
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`vessel detail and reduction factors pass axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await login(page, USERS.manager);
    for (const path of [
      `/cii/vessels/${BAHARI}`,
      `/cii/vessels/${BAHARI}?tab=history`,
      `/cii/vessels/${BAHARI}?tab=segments`,
      `/cii/vessels/${BAHARI}?tab=dcs`,
      '/cii/reduction-factors',
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
    '/cii',
    `/cii/vessels/${BAHARI}`,
    `/cii/vessels/${BAHARI}?tab=segments`,
    '/cii/reduction-factors',
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
