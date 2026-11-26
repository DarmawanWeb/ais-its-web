import { expect, test } from '@playwright/test';

import { login, resetMockGateway, USERS } from './fixtures';

/**
 * Alert routing rules (feature `alert-rules`) against the notification mock
 * (e2e/mock-server/routes/alert-rules.mjs): create with conditions and three channels, the
 * webhook signing secret shown once and rotated, enable/disable, edit, delivery history, webhook
 * signature guide and delete.
 */
test.describe('alert rules', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('create a rule with conditions and e-mail, Telegram and webhook channels, then manage it', async ({
    page,
  }) => {
    await login(page, USERS.manager);
    await page.goto('/alert-rules');
    await expect(page.getByRole('heading', { level: 1, name: 'Aturan Alert' })).toBeVisible();

    await page.getByRole('button', { name: 'Buat aturan' }).click();
    const editor = page.getByRole('dialog', { name: 'Aturan alert baru' });
    await editor.getByRole('textbox', { name: 'Nama aturan' }).fill('EWS kritis Batu Ampar');
    await editor
      .getByRole('checkbox', { name: /Keselamatan navigasi/ })
      .first()
      .check();
    await editor.getByRole('radio', { name: /Hanya alert kritis/ }).click();
    await editor.getByRole('textbox', { name: 'Tujuan kanal 1' }).fill('ops@pelni.test');
    await editor.getByRole('button', { name: 'Telegram', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Tujuan kanal 2' }).fill('-1001234567890');
    await editor.getByRole('button', { name: 'Webhook', exact: true }).click();
    await editor
      .getByRole('textbox', { name: 'Tujuan kanal 3' })
      .fill('https://ops.pelni.test/hooks/ais');
    await editor.getByRole('button', { name: 'Buat aturan' }).click();
    await expect(page.getByText('Aturan "EWS kritis Batu Ampar" dibuat')).toBeVisible();

    // The new webhook channel's signing secret is shown once, until the user confirms storing it.
    const secret = page.getByRole('dialog', { name: 'Simpan secret penandatanganan webhook' });
    await expect(secret.getByTestId('webhook-signing-secret')).toHaveValue(/^whsec_/);
    const firstSecret = await secret.getByTestId('webhook-signing-secret').inputValue();
    await expect(secret.getByRole('button', { name: 'Selesai' })).toBeDisabled();
    await secret.getByRole('checkbox', { name: /Saya sudah menyimpan secret ini/ }).check();
    await secret.getByRole('button', { name: 'Selesai' }).click();
    await expect(secret).toHaveCount(0);

    const card = page.getByRole('article', { name: 'EWS kritis Batu Ampar' });
    await expect(card).toContainText('ops@pelni.test');
    await expect(card).toContainText('-1001234567890');
    await expect(card).toContainText('ops.pelni.test/hooks/ais');

    // Rotate the webhook secret: a new secret, again shown once.
    await card.getByRole('button', { name: 'Aksi aturan EWS kritis Batu Ampar' }).click();
    await page.getByRole('menuitem', { name: 'Ganti secret webhook' }).click();
    await page
      .getByRole('alertdialog', { name: 'Ganti secret ops.pelni.test/hooks/ais?' })
      .getByRole('button', { name: 'Ganti secret' })
      .click();
    await expect(secret.getByTestId('webhook-signing-secret')).toHaveValue(/^whsec_/);
    expect(await secret.getByTestId('webhook-signing-secret').inputValue()).not.toBe(firstSecret);
    await secret.getByRole('checkbox', { name: /Saya sudah menyimpan secret ini/ }).check();
    await secret.getByRole('button', { name: 'Selesai' }).click();
    await expect(secret).toHaveCount(0);

    // Disable, then enable again.
    const toggle = card.getByRole('switch', { name: 'Aktifkan aturan EWS kritis Batu Ampar' });
    await toggle.click();
    await expect(page.getByText('Aturan "EWS kritis Batu Ampar" dinonaktifkan')).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(page.getByText('Aturan "EWS kritis Batu Ampar" diaktifkan')).toBeVisible();

    // Edit the name.
    await card.getByRole('button', { name: 'Aksi aturan EWS kritis Batu Ampar' }).click();
    await page.getByRole('menuitem', { name: 'Ubah aturan' }).click();
    const edit = page.getByRole('dialog', { name: 'Ubah aturan alert' });
    await edit.getByRole('textbox', { name: 'Nama aturan' }).fill('EWS kritis Batam');
    await edit.getByRole('button', { name: /Simpan/ }).click();
    await expect(page.getByText('Aturan "EWS kritis Batam" disimpan')).toBeVisible();

    // Delete with confirmation.
    const renamed = page.getByRole('article', { name: 'EWS kritis Batam' });
    await renamed.getByRole('button', { name: 'Aksi aturan EWS kritis Batam' }).click();
    await page.getByRole('menuitem', { name: /Hapus/ }).click();
    await page
      .getByRole('alertdialog', { name: 'Hapus aturan "EWS kritis Batam"?' })
      .getByRole('button', { name: 'Hapus aturan' })
      .click();
    await expect(page.getByText('Aturan "EWS kritis Batam" dihapus')).toBeVisible();
    await expect(page.getByRole('article', { name: 'EWS kritis Batam' })).toHaveCount(0);
  });

  test('delivery history of a rule and the webhook signature guide', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/alert-rules');
    const card = page.getByRole('article', { name: 'EWS & tubrukan kritis armada' });
    await card.getByRole('button', { name: /Riwayat pengiriman/ }).click();
    const history = page.getByRole('dialog', { name: 'Riwayat pengiriman' });
    await expect(history.getByText('Telegram 429: retry after 30 s')).toBeVisible();
    // Only the delivered ones: the retrying Telegram delivery leaves the list.
    await history.getByText('Terkirim', { exact: true }).first().click();
    await expect(history.getByText('Telegram 429: retry after 30 s')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Panduan webhook' }).click();
    const guide = page.getByRole('dialog', { name: /Verifikasi webhook/ });
    await expect(guide).toContainText('X-AIS-ITS-Signature');
    await expect(guide).toContainText('X-AIS-ITS-Timestamp');
    await expect(guide).toContainText('X-AIS-ITS-Key-Id');
    await expect(guide).toContainText('HMAC-SHA256');
  });
});
