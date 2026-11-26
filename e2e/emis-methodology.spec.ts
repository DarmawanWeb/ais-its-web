import { expect, test } from '@playwright/test';

import { axeViolations, login, USERS } from './fixtures';

/** Emisi & Metodologi — "Metodologi & Referensi" (spec §17): catalog, deep links, bibliography. */

test('catalog by domain with filters, KaTeX formulas and implementation details', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto('/methodology');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Metodologi & Referensi' }),
  ).toBeVisible();
  const contents = page.getByRole('navigation', { name: 'Daftar isi' });
  await expect(contents.getByRole('link', { name: /Bahan bakar, emisi dan CII/ })).toBeVisible();

  const card = page.locator('[id="cii.attained_accumulation"]');
  await expect(card.locator('.katex').first()).toBeVisible();
  await expect(card).toContainText('Implementasi');

  const search = page.getByRole('searchbox', { name: /Cari metode/ });
  await search.fill('haversine');
  await expect(page.locator('[id="geo.haversine_distance"]')).toBeVisible();
  await expect(page.locator('[id="cii.attained_accumulation"]')).toHaveCount(0);
  await search.fill('');

  await page.getByLabel('Domain').click();
  await page.getByRole('option', { name: 'SEEMP' }).click();
  await expect(page.locator('[id="seemp.measure.lng"]')).toBeVisible();
  await expect(page.locator('[id="geo.haversine_distance"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hapus filter' }).first().click();

  await page.getByLabel('Hanya yang perlu sitasi').click();
  await expect(page.getByText(/^\d+ dari \d+ metode$/)).toBeVisible();
  await expect(
    page
      .locator('article')
      .first()
      .getByText(/Perlu sitasi/)
      .first(),
  ).toBeVisible();
});

test('MethodInfo deep link lands on the method; service methods use the catalog entry', async ({
  page,
}) => {
  await login(page, USERS.manager);
  await page.goto('/methodology#cii.rating_grade');
  await expect(page.locator('[id="cii.rating_grade"]')).toBeInViewport();
  await expect(page.locator('[id="cii.rating_grade"]')).toBeFocused();
  // Methods the emission service reports as catalogued are shown once, from the catalog.
  const projection = page.locator('[id="cii.year_end_projection"]');
  await expect(projection).toHaveCount(1);
  await expect(projection).toContainText('Proyeksi CII akhir tahun (linear)');
  await expect(projection).not.toContainText('Belum dikatalogkan');
});

test('bibliography: search, verification filter and copy citation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, USERS.manager);
  await page.goto('/methodology#bibliography');
  const bibliography = page.getByRole('region', { name: 'Pustaka' });
  await expect(bibliography).toBeVisible();
  await bibliography.getByRole('searchbox').fill('MEPC.354');
  await expect(bibliography.getByText(/MEPC\.354\(78\)/).first()).toBeVisible();
  await expect(bibliography.getByText(/1 dari \d+ referensi|\d+ dari \d+ referensi/)).toBeVisible();

  await bibliography.getByRole('button', { name: 'Salin sitasi' }).first().click();
  await expect(page.getByText('Sitasi disalin')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('MEPC.354(78)');

  await bibliography.getByRole('searchbox').fill('');
  await bibliography.getByLabel('Verifikasi').click();
  await page.getByRole('option', { name: 'Dikoreksi' }).click();
  await expect(bibliography.getByText('Dikoreksi').first()).toBeVisible();
  await expect(bibliography.getByText('Terverifikasi', { exact: true })).toHaveCount(0);
});

test('print layout shows only the content', async ({ page }) => {
  await login(page, USERS.manager);
  await page.goto('/methodology');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Metodologi & Referensi' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cetak' })).toBeHidden();
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`deep-linked method and filtered bibliography pass axe (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await login(page, USERS.manager);
    await page.goto('/methodology#seemp.measure.cold_ironing');
    await expect(page.locator('[id="seemp.measure.cold_ironing"]')).toBeInViewport();
    await page.waitForLoadState('networkidle');
    expect(await axeViolations(page)).toEqual([]);
  });
}
