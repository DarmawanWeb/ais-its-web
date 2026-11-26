import { expect, test, type Page } from '@playwright/test';

import { axeViolations, login, MOCK_GATEWAY_URL, resetMockGateway, USERS } from './fixtures';

/** Zones feature (geo service, spec §13.6) against e2e/mock-server/routes/zones.mjs. */
const PELNI_GEOFENCE = '0192f0c8-7d3a-7c2e-9a1f-000000000009';
const BATU_AMPAR_RESTRICTED = '0192f0c8-7d3a-7c2e-9a1f-000000000004';

/** A second editor: signs in through the mock gateway and changes a zone. */
async function concurrentEdit(id: string, body: Record<string, unknown>) {
  const session = await fetch(`${MOCK_GATEWAY_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(USERS.admin),
  });
  const { accessToken } = (await session.json()) as { accessToken: string };
  const response = await fetch(`${MOCK_GATEWAY_URL}/api/v2/zones/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'If-Match': '*',
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
}

async function openEditor(page: Page, id: string) {
  await page.goto(`/zones/${id}`);
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await expect(page.getByLabel('Nama')).not.toHaveValue('');
}

test.describe('zones', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('registry: filters, scope and the map', async ({ page }) => {
    await login(page);
    await page.goto('/zones');
    await expect(page.getByRole('heading', { level: 1, name: 'Zona & Geofence' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Daftar zona' });
    await expect(table.getByText('Area terlarang Batu Ampar')).toBeVisible();
    await page.getByRole('radio', { name: 'Global' }).click();
    await expect(page).toHaveURL(/scope=global/);
    await expect(table.getByText('Geofence armada Sekupang')).toHaveCount(0);
    await page.getByRole('button', { name: 'Semua jenis' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Area labuh jangkar' }).click();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(page.getByText('1 zona di peta')).toBeVisible();
  });

  test('draws a point zone, edits it with If-Match and deletes it', async ({ page }) => {
    await login(page);
    await page.goto('/zones');
    await page.getByRole('link', { name: 'Zona baru' }).click();
    await expect(page).toHaveURL(/\/zones\/new$/);
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await page.getByLabel('Nama').fill('Titik pantau Belakang Padang');
    await expect(page.getByLabel('Kode')).toHaveValue('titik-pantau-belakang-padang');
    await page.getByRole('button', { name: 'Titik', exact: true }).click();
    const canvas = page.getByTestId('map-canvas');
    const box = (await canvas.boundingBox())!;
    await page.waitForTimeout(500);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
    await expect(page.getByText('Point', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Buffer')).toHaveValue('500');
    await page.getByRole('button', { name: 'Buat zona' }).click();
    await expect(page.getByText('Zona Titik pantau Belakang Padang dibuat')).toBeVisible();
    await expect(page).toHaveURL(/\/zones\/[0-9a-f-]{36}$/);

    await page.getByLabel('Buffer').fill('750');
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await expect(
      page.getByText('Perubahan zona Titik pantau Belakang Padang disimpan'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Hapus', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Hapus' }).click();
    await expect(page).toHaveURL(/\/zones$/);
    await expect(page.getByText('Zona Titik pantau Belakang Padang dihapus')).toBeVisible();
  });

  test('a concurrent change opens the conflict dialog (reload or overwrite)', async ({ page }) => {
    await login(page);
    await openEditor(page, PELNI_GEOFENCE);
    await page.getByLabel('Buffer').fill('300');
    await concurrentEdit(PELNI_GEOFENCE, { name: 'Geofence armada (diubah orang lain)' });
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    const dialog = page.getByRole('alertdialog', { name: /diubah orang lain/ });
    await expect(dialog).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Muat ulang versi terbaru' }).click();
    await expect(page.getByLabel('Nama')).toHaveValue('Geofence armada (diubah orang lain)');
    await expect(page.getByLabel('Buffer')).toHaveValue('0');

    await page.getByLabel('Buffer').fill('300');
    await concurrentEdit(PELNI_GEOFENCE, { active: false });
    await page.getByRole('button', { name: 'Simpan perubahan' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Timpa dengan perubahan saya' })
      .click();
    await expect(
      page.getByText('Perubahan zona Geofence armada (diubah orang lain) disimpan'),
    ).toBeVisible();
  });

  test('imports GeoJSON and explains the service validation', async ({ page }) => {
    await login(page);
    await page.goto('/zones');
    await page.getByRole('button', { name: 'Impor GeoJSON' }).click();
    const dialog = page.getByRole('dialog', { name: 'Impor GeoJSON' });
    await dialog.getByTestId('zone-import-input').setInputFiles({
      name: 'swapped.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(JSON.stringify({ type: 'Point', coordinates: [1.16, 104.02] })),
    });
    await expect(dialog.getByText('Lintang dan bujur tertukar?')).toBeVisible();
    // a bow-tie polygon: structurally valid, refused by the service (ST_IsValid)
    const bowtie = {
      type: 'Feature',
      properties: { name: 'Area impor', kind: 'custom' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [104.0, 1.1],
            [104.1, 1.2],
            [104.1, 1.1],
            [104.0, 1.2],
            [104.0, 1.1],
          ],
        ],
      },
    };
    await dialog.getByTestId('zone-import-input').setInputFiles({
      name: 'area.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(JSON.stringify(bowtie)),
    });
    await expect(dialog.getByText('area.geojson')).toBeVisible();
    await dialog.getByRole('button', { name: 'Buka di editor' }).click();
    await expect(page).toHaveURL(/\/zones\/new$/);
    await expect(page.getByLabel('Nama')).toHaveValue('Area impor');
    await page.getByRole('button', { name: 'Buat zona' }).click();
    await expect(page.getByTestId('geometry-issues')).toContainText(
      'Geometri tidak valid menurut PostGIS: Self-intersection',
    );
  });

  test('organization users without zone:write see zones read-only', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/zones');
    await expect(
      page.getByRole('table', { name: 'Daftar zona' }).getByText('Geofence armada Sekupang'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zona baru' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Impor GeoJSON' })).toHaveCount(0);
    // a zone of another organization is not visible
    await expect(page.getByText('Area pemeriksaan KSOP')).toHaveCount(0);
    await openEditor(page, BATU_AMPAR_RESTRICTED);
    await expect(page.getByText('Hanya baca')).toBeVisible();
    await expect(page.getByLabel('Nama')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Simpan perubahan' })).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.goto('/zones/new');
    await expect(page.getByText('Akses ditolak')).toBeVisible();
  });
});
