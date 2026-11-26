import { createHmac } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

/**
 * Profile & security (feature `profile`, no sidebar entry) against the auth mock
 * (e2e/mock-server/routes/profile.mjs): account, password, TOTP MFA with a real RFC 6238 code,
 * sessions and memberships — plus the a11y and layout checks a page without a nav entry needs.
 */

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) of a base32 secret, as an authenticator app computes it. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', bytes).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

test.describe('profile & security', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`is accessible and fits the screen (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await login(page, USERS.manager);
      await page.goto('/profile');
      await expect(page.getByRole('list', { name: 'Daftar sesi aktif' })).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await axeViolations(page)).toEqual([]);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
      }
    });
  }

  test('rename the account and refuse a wrong current password', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Ubah nama' }).click();
    const name = page.getByRole('textbox', { name: 'Nama tampil' });
    await name.fill('Rina Nakhoda Utama');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await expect(page.getByText('Nama berhasil diperbarui')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveText('Rina Nakhoda Utama');

    await page.getByLabel('Kata sandi saat ini', { exact: true }).fill('SalahSekali123');
    await page.getByLabel('Kata sandi baru', { exact: true }).fill('KapalBaru2026');
    await page.getByLabel('Ulangi kata sandi baru', { exact: true }).fill('KapalBaru2026');
    await page.getByRole('button', { name: 'Ganti kata sandi' }).click();
    await expect(page.getByText('Kata sandi saat ini salah')).toBeVisible();
  });

  test('set up MFA with the QR secret and a TOTP code, then turn it off', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Aktifkan MFA' }).click();
    const setup = page.getByRole('dialog', { name: 'Aktifkan autentikasi dua langkah' });
    await expect(setup.getByRole('img', { name: /QR/ })).toBeVisible();
    const secret = (await setup.getByTestId('mfa-secret').textContent()) ?? '';
    expect(secret.replace(/\s/g, '')).toMatch(/^[A-Z2-7]{32}$/);

    await setup.getByLabel('Kode verifikasi').fill(totp(secret));
    await setup.getByRole('button', { name: 'Aktifkan' }).click();
    await expect(page.getByText('MFA berhasil diaktifkan')).toBeVisible();
    await expect(page.getByText('Akun dilindungi MFA')).toBeVisible();

    await page.getByRole('button', { name: 'Nonaktifkan MFA' }).click();
    const disable = page.getByRole('dialog', { name: 'Nonaktifkan autentikasi dua langkah' });
    await disable.getByLabel('Kode verifikasi').fill(totp(secret));
    await disable.getByRole('button', { name: 'Nonaktifkan MFA' }).click();
    await expect(page.getByText('MFA dinonaktifkan')).toBeVisible();
    await expect(page.getByText('MFA belum diaktifkan')).toBeVisible();
  });

  test('revoke a session on another device', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/profile');
    const sessions = page.getByRole('list', { name: 'Daftar sesi aktif' });
    const others = sessions.getByRole('listitem').filter({ hasNot: page.getByText('Sesi ini') });
    await expect(others.first()).toBeVisible();
    const before = await others.count();
    await others
      .first()
      .getByRole('button', { name: /Cabut sesi/ })
      .click();
    await page
      .getByRole('alertdialog', { name: 'Cabut sesi ini?' })
      .getByRole('button', { name: /Cabut sesi/ })
      .click();
    await expect(others).toHaveCount(before - 1);
  });

  test('switch the active organization from the memberships', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/profile');
    const memberships = page.getByRole('list', { name: 'Daftar keanggotaan' });
    await memberships
      .getByRole('button', { name: /Jadikan aktif\s*: PT Pelayaran Nusantara/ })
      .click();
    await expect(page.getByTestId('org-switcher')).toContainText('PT Pelayaran Nusantara');
    await expect(
      memberships.getByRole('listitem').filter({ hasText: 'PT Pelayaran Nusantara' }),
    ).toHaveAttribute('aria-current', 'true');
  });
});
