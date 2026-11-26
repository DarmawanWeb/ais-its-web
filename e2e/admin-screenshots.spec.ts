import { expect, test, type Page } from '@playwright/test';

import { login, resetMockGateway, USERS } from './fixtures';

/**
 * Documentation screenshots of the settings & identity pages (admin, alert-rules, profile) in
 * both themes at 1440×900, plus 390×844 for the main page of each feature:
 * docs/screenshots/<feature>-<page>-<variant>.png. Runs in the `screenshots` project only
 * (`pnpm screenshots`), like e2e/screenshots.spec.ts.
 */
const DIR = 'docs/screenshots';
const THEMES = ['dark', 'light'] as const;
/** PT Pelayaran Nusantara: the demo fleet with members, keys and devices. */
const FLEET_ORG = '0192f0c8-7d3a-7c2e-9a1b-000000000001';

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function settle(page: Page, ms = 800) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  // No focus ring of the last clicked control in the picture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(ms);
}

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('settings & identity screenshots', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  for (const theme of THEMES) {
    test(`admin (${theme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await setTheme(page, theme);
      await login(page, USERS.admin);

      await open(page, '/admin/organizations', 'Organisasi');
      await expect(page.getByRole('cell', { name: /KSOP Batam/ }).first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-organizations-${theme}.png` });

      await page.getByRole('tab', { name: 'Direktori pengguna' }).click();
      await expect(page.getByRole('cell', { name: /Andi Pratama/ }).first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-users-${theme}.png` });

      await open(page, `/admin/members?org=${FLEET_ORG}`, 'Anggota');
      await expect(page.getByRole('cell', { name: /Sari Wulandari/ }).first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-members-${theme}.png` });

      await page.getByRole('button', { name: 'Undang anggota' }).click();
      const invite = page.getByRole('dialog', { name: 'Undang anggota' });
      await invite.getByRole('textbox', { name: 'E-mail' }).fill('nakhoda.baru@pelni.test');
      await invite.getByRole('textbox', { name: 'Nama' }).fill('Nakhoda Baru');
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/admin-members-invite-${theme}.png` });
      await page.keyboard.press('Escape');

      await open(page, `/admin/api-keys?org=${FLEET_ORG}`, 'Kunci API');
      await expect(
        page.getByRole('cell', { name: /Integrasi dasbor armada/ }).first(),
      ).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-api-keys-${theme}.png` });

      await page.getByRole('button', { name: 'Kunci API baru' }).click();
      const create = page.getByRole('dialog', { name: 'Kunci API baru' });
      await create.getByRole('textbox', { name: 'Nama' }).fill('Flow meter ME KM Rempang');
      await create.getByRole('checkbox', { name: /telemetry:ingest/ }).check();
      await create.getByRole('button', { name: 'Buat kunci' }).click();
      await expect(page.getByRole('dialog', { name: 'Salin kunci sekarang' })).toBeVisible();
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/admin-api-keys-secret-${theme}.png` });
      await page.getByRole('checkbox', { name: /Saya sudah menyimpan kunci/ }).check();
      await page.getByRole('button', { name: 'Selesai' }).click();

      await open(page, '/admin/reference-data', 'Data Referensi');
      await expect(page.getByRole('cell', { name: /Bulk carrier/ }).first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-reference-data-${theme}.png` });

      await page.goto('/admin/reference-data?tab=formulas');
      await page.getByRole('button', { name: 'Rumus bahan bakar baru' }).click();
      const formula = page.getByRole('dialog', { name: 'Rumus bahan bakar baru' });
      await formula.getByLabel('Nama', { exact: true }).fill('KM Kepri Indah');
      await formula
        .getByLabel('Rumus mesin induk')
        .fill('-0.041 * speedKnot ^ 2 + 0.912 * speedKnot - 0.02');
      await formula.getByLabel('Rumus mesin bantu').fill('1.48 * Math.exp(-0.061 * speedKnot) +');
      await expect(formula.getByText('Rumus valid')).toBeVisible();
      await settle(page, 400);
      await page.screenshot({ path: `${DIR}/admin-reference-formula-${theme}.png` });
      await page.keyboard.press('Escape');

      await open(page, `/admin/devices?org=${FLEET_ORG}`, 'Perangkat');
      await expect(
        page.getByRole('cell', { name: /Gateway MQTT MV Batam Express/ }).first(),
      ).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-devices-${theme}.png` });

      await page.getByRole('button', { name: 'Aksi untuk Gateway MQTT MV Batam Express' }).click();
      await page.getByRole('menuitem', { name: 'Panduan koneksi' }).click();
      await expect(page.getByRole('dialog', { name: 'Panduan koneksi' })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/admin-devices-connection-${theme}.png` });
      await page.keyboard.press('Escape');

      await open(page, '/admin/audit-log?org=all', 'Log Audit');
      await expect(
        page
          .getByRole('table', { name: 'Catatan audit' })
          .getByText('Peran anggota diubah')
          .first(),
      ).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/admin-audit-log-${theme}.png` });

      await page
        .getByRole('row', { name: /Organisasi diperbarui/ })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: 'Catatan audit' })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/admin-audit-detail-${theme}.png` });
    });

    test(`alert rules (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.admin);

      await open(page, '/alert-rules', 'Aturan Alert');
      await expect(page.getByText('Pengawasan kapal tanker').first()).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/alert-rules-rules-${theme}.png` });

      await page.getByRole('button', { name: 'Buat aturan' }).click();
      await expect(page.getByRole('dialog', { name: 'Aturan alert baru' })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/alert-rules-editor-${theme}.png` });
      await page.keyboard.press('Escape');

      await page
        .getByRole('button', { name: /Riwayat pengiriman/ })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: /Riwayat pengiriman/ })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/alert-rules-deliveries-${theme}.png` });
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Panduan webhook' }).click();
      await expect(page.getByRole('dialog', { name: /webhook/i })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/alert-rules-webhook-${theme}.png` });
    });

    test(`profile (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.manager);

      await open(page, '/profile', 'Profil & Keamanan');
      await expect(page.getByRole('list', { name: 'Daftar sesi aktif' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/profile-overview-${theme}.png` });

      await page.getByRole('button', { name: 'Aktifkan MFA' }).click();
      const mfa = page.getByRole('dialog', { name: 'Aktifkan autentikasi dua langkah' });
      await expect(mfa.getByRole('img', { name: /QR/ })).toBeVisible();
      await settle(page, 600);
      await page.screenshot({ path: `${DIR}/profile-mfa-${theme}.png` });
    });
  }

  test('main pages on a phone (390×844)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'dark');
    await login(page, USERS.admin);

    await open(page, '/admin/organizations', 'Organisasi');
    await expect(page.getByText('KSOP Batam').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/admin-organizations-mobile.png` });

    await open(page, '/alert-rules', 'Aturan Alert');
    await expect(page.getByText('Pengawasan kapal tanker').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/alert-rules-rules-mobile.png` });

    await open(page, '/profile', 'Profil & Keamanan');
    await expect(page.getByRole('list', { name: 'Daftar sesi aktif' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/profile-overview-mobile.png` });
  });
});
