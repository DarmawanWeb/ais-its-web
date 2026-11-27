import { expect, test } from '@playwright/test';

import { axeViolations, login, resetMockGateway, USERS } from './fixtures';

/**
 * Key flows of the administration pages (feature `admin`) against the mock gateway
 * (e2e/mock-server/routes/admin.mjs): organizations, members and invitations, API keys,
 * reference data, telemetry devices and the audit log that records all of it.
 */
const FLEET_ORG = '0192f0c8-7d3a-7c2e-9a1b-000000000001';
const KSOP_ORG = '0192f0c8-7d3a-7c2e-9a1b-000000000002';

test.describe('admin console', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('organizations: create, refuse a kind change that strands authority roles, delete with the slug', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/admin/organizations');
    const table = page.getByRole('table', { name: 'Organisasi' });
    await expect(table.getByText('ksop-batam')).toBeVisible();

    await page.getByRole('button', { name: 'Organisasi baru' }).click();
    const create = page.getByRole('dialog', { name: 'Organisasi baru' });
    await create.getByRole('textbox', { name: 'Nama' }).fill('Otoritas Pelabuhan Dumai');
    await expect(create.getByText(/otoritas-pelabuhan-dumai/)).toBeVisible();
    await create.getByRole('radio', { name: /^Otoritas/ }).click();
    await create.getByRole('button', { name: 'Buat organisasi' }).click();
    await expect(page.getByText('Organisasi Otoritas Pelabuhan Dumai dibuat')).toBeVisible();
    await expect(table.getByText('otoritas-pelabuhan-dumai')).toBeVisible();

    // KSOP Batam has authority members: becoming a research institute is refused (409).
    await page.getByRole('button', { name: 'Aksi untuk KSOP Batam' }).click();
    await page.getByRole('menuitem', { name: /Ubah/ }).click();
    const edit = page.getByRole('dialog', { name: 'Ubah organisasi' });
    await edit.getByRole('radio', { name: /^Riset/ }).click();
    await expect(edit.getByText(/menghalangi perubahan ini/)).toBeVisible();
    await edit.getByRole('button', { name: 'Simpan' }).click();
    await expect(edit.getByText('Organisasi tidak dapat disimpan')).toBeVisible();
    await expect(edit.getByText(/peran otoritas memerlukan organisasi otoritas/)).toBeVisible();
    await page.keyboard.press('Escape');

    // Deleting needs the slug typed out.
    await page.getByRole('button', { name: 'Aksi untuk Otoritas Pelabuhan Dumai' }).click();
    await page.getByRole('menuitem', { name: /Hapus/ }).click();
    const remove = page.getByRole('dialog', { name: 'Hapus Otoritas Pelabuhan Dumai?' });
    const confirm = remove.getByRole('button', { name: 'Hapus organisasi' });
    await expect(confirm).toBeDisabled();
    await remove.getByRole('textbox').fill('otoritas-pelabuhan-dumai');
    await confirm.click();
    await expect(page.getByText('Organisasi Otoritas Pelabuhan Dumai dihapus')).toBeVisible();
    await expect(table.getByText('otoritas-pelabuhan-dumai')).toHaveCount(0);
  });

  test('members: invite an authority, protect the last org admin, withdraw the invitation', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/admin/members?org=${KSOP_ORG}`);
    await expect(page.getByText('Organisasi otoritas: peran otoritas tersedia.')).toBeVisible();

    await page.getByRole('button', { name: 'Undang anggota' }).click();
    const invite = page.getByRole('dialog', { name: 'Undang anggota' });
    await invite.getByRole('textbox', { name: 'E-mail' }).fill('syahbandar@ksop-batam.go.id');
    await invite.getByRole('textbox', { name: 'Nama' }).fill('Syahbandar Batam');
    await invite.getByRole('radio', { name: /^Otoritas/ }).click();
    await invite.getByRole('button', { name: 'Kirim undangan' }).click();
    await expect(page.getByText('Undangan dikirim ke syahbandar@ksop-batam.go.id')).toBeVisible();

    // Andi Pratama is the only org admin of KSOP Batam.
    await page.getByRole('button', { name: 'Aksi untuk Andi Pratama' }).click();
    await page.getByRole('menuitem', { name: /Ubah peran/ }).click();
    const role = page.getByRole('dialog', { name: 'Ubah peran' });
    await expect(role.getByText(/admin organisasi terakhir/)).toBeVisible();
    await expect(role.getByRole('radio', { name: /^Pengamat/ })).toBeDisabled();
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: /Undangan/ }).click();
    const invitations = page.getByRole('table', { name: 'Undangan' });
    await expect(
      invitations.getByText('syahbandar@ksop-batam.go.id', { exact: true }),
    ).toBeVisible();
    await invitations
      .getByRole('button', { name: /Tarik undangan\s*: syahbandar@ksop-batam\.go\.id/ })
      .click();
    const withdraw = page.getByRole('alertdialog', {
      name: 'Tarik undangan untuk syahbandar@ksop-batam.go.id?',
    });
    await withdraw.getByRole('button', { name: 'Tarik undangan' }).click();
    await expect(
      page.getByText('Undangan untuk syahbandar@ksop-batam.go.id ditarik'),
    ).toBeVisible();
    await expect(invitations.getByText('syahbandar@ksop-batam.go.id', { exact: true })).toHaveCount(
      0,
    );
  });

  test('API keys: the secret is shown once, platform-only scopes are refused, keys are revoked', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/admin/api-keys?org=${FLEET_ORG}`);
    await page.getByRole('button', { name: 'Kunci API baru' }).click();
    const create = page.getByRole('dialog', { name: 'Kunci API baru' });
    await create.getByRole('textbox', { name: 'Nama' }).fill('Flow meter ME KM Rempang');
    await expect(create.getByRole('checkbox', { name: /telemetry:ingest/ })).toBeChecked();
    await create.getByRole('button', { name: 'Buat kunci' }).click();

    const secret = page.getByRole('dialog', { name: 'Salin kunci sekarang' });
    const key = await secret.getByRole('textbox', { name: 'Kunci API' }).inputValue();
    expect(key).toMatch(/^sk_[\w-]+_[\w-]+$/);
    // Let the dialog finish fading in: axe measures colours as rendered.
    await secret.evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    await page.waitForTimeout(300); // the overlay fades in alongside
    expect(await axeViolations(page)).toEqual([]);
    await secret.getByRole('checkbox', { name: /Saya sudah menyimpan kunci/ }).check();
    await secret.getByRole('button', { name: 'Selesai' }).click();
    await expect(page.getByText(key)).toHaveCount(0);
    const table = page.getByRole('table', { name: 'Kunci API' });
    await expect(table.getByText('Flow meter ME KM Rempang', { exact: true })).toBeVisible();

    // A platform-only scope refused by the service is explained in the dialog.
    await page.route('**/api/v2/api-keys', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'urn:ais-its:problem:scope_not_grantable',
              status: 403,
              code: 'SCOPE_NOT_GRANTABLE',
              title: 'Scope not grantable',
            }),
          })
        : route.continue(),
    );
    await page.getByRole('button', { name: 'Kunci API baru' }).click();
    await create.getByRole('textbox', { name: 'Nama' }).fill('Pusher AIS mitra');
    await create.getByRole('checkbox', { name: /ais:ingest/ }).check();
    await create.getByRole('button', { name: 'Buat kunci' }).click();
    await expect(create.getByText(/hanya diberikan oleh administrator platform/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.unroute('**/api/v2/api-keys');

    await table.getByRole('button', { name: /Cabut\s*: Flow meter ME KM Rempang/ }).click();
    const revoke = page.getByRole('alertdialog', { name: 'Cabut Flow meter ME KM Rempang?' });
    await revoke.getByRole('button', { name: 'Cabut' }).click();
    await expect(page.getByText('Kunci Flow meter ME KM Rempang dicabut')).toBeVisible();
    await expect(table.getByText('Flow meter ME KM Rempang', { exact: true })).toHaveCount(0);
  });

  test('reference data: formulas follow the safe grammar, rows used by vessels cannot be deleted', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto('/admin/reference-data?tab=formulas');
    await page.getByRole('button', { name: 'Rumus bahan bakar baru' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rumus bahan bakar baru' });
    await dialog.getByRole('textbox', { name: 'Nama', exact: true }).fill('KM Kepri Indah');
    const main = dialog.getByRole('textbox', { name: 'Rumus mesin induk' });
    await main.fill('speedKnot * 2;');
    await expect(dialog.getByText('Karakter “;” tidak diizinkan pada karakter 14')).toBeVisible();
    await main.fill('-0.041 * speedKnot ^ 2 + 0.912 * speedKnot - 0.02');
    await dialog
      .getByRole('textbox', { name: 'Rumus mesin bantu' })
      .fill('1.48 * Math.exp(-0.061 * speedKnot)');
    await expect(dialog.getByText('Rumus valid')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('KM Kepri Indah disimpan')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Rumus bahan bakar' })).toContainText(
      'KM Kepri Indah',
    );

    await page.getByRole('tab', { name: 'Bahan bakar', exact: true }).click();
    await page.getByRole('button', { name: 'Aksi untuk Diesel / gas oil' }).click();
    await page.getByRole('menuitem', { name: /Hapus/ }).click();
    await page
      .getByRole('alertdialog', { name: 'Hapus Diesel / gas oil?' })
      .getByRole('button', { name: 'Hapus' })
      .click();
    await expect(page.getByText('Masih dipakai kapal')).toBeVisible();
  });

  test('devices: register an MQTT gateway, read its connection guide, deactivate and delete it', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/admin/devices?org=${FLEET_ORG}`);
    await page.getByRole('button', { name: 'Daftarkan perangkat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Daftarkan perangkat' });
    await dialog.getByRole('combobox', { name: 'Kapal' }).click();
    await page.getByRole('option', { name: /KM Rempang/ }).click();
    await dialog.getByRole('textbox', { name: 'Nama' }).fill('Gateway MQTT KM Rempang');
    await dialog.getByRole('radio', { name: /MQTT/ }).click();
    await dialog.getByRole('button', { name: 'Daftarkan perangkat' }).click();
    await expect(page.getByText('Perangkat Gateway MQTT KM Rempang didaftarkan')).toBeVisible();

    // A new MQTT gateway opens its connection guide right away: topic and payload to configure.
    const guide = page.getByRole('dialog', { name: 'Panduan koneksi' });
    await expect(guide.getByText(/^aisits\/telemetry\/[0-9a-f-]{36}$/)).toBeVisible();
    await guide.getByRole('button', { name: 'Tutup' }).click();
    const table = page.getByRole('table', { name: 'Perangkat telemetri' });
    await expect(table.getByText('Gateway MQTT KM Rempang', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Aksi untuk Gateway MQTT KM Rempang' }).click();
    await page.getByRole('menuitem', { name: 'Nonaktifkan' }).click();
    await expect(page.getByText('Perangkat Gateway MQTT KM Rempang dinonaktifkan')).toBeVisible();

    await page.getByRole('button', { name: 'Aksi untuk Gateway MQTT KM Rempang' }).click();
    await page.getByRole('menuitem', { name: /Hapus/ }).click();
    await page
      .getByRole('alertdialog', { name: 'Hapus Gateway MQTT KM Rempang?' })
      .getByRole('button', { name: 'Hapus' })
      .click();
    await expect(page.getByText('Perangkat Gateway MQTT KM Rempang dihapus')).toBeVisible();
    await expect(table.getByText('Gateway MQTT KM Rempang', { exact: true })).toHaveCount(0);
  });

  test('audit log: what the admin just did is recorded, filterable and readable', async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto(`/admin/members?org=${FLEET_ORG}`);
    await page.getByRole('button', { name: 'Aksi untuk Budi Santoso' }).click();
    await page.getByRole('menuitem', { name: /Ubah peran/ }).click();
    const role = page.getByRole('dialog', { name: 'Ubah peran' });
    await role.getByRole('radio', { name: /^Manajer armada/ }).click();
    await role.getByRole('button', { name: 'Simpan peran' }).click();
    await expect(page.getByText('Peran Budi Santoso diubah')).toBeVisible();

    await page.goto(`/admin/audit-log?org=${FLEET_ORG}`);
    await page.getByRole('combobox', { name: 'Aksi' }).fill('membership.update');
    const table = page.getByRole('table', { name: 'Catatan audit' });
    await expect(table.getByRole('row')).toHaveCount(3); // header + new record + seeded record
    await table
      .getByRole('row', { name: /Peran anggota diubah/ })
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: 'Catatan audit' });
    await expect(sheet.getByText('Dewi Admin')).toBeVisible();
    const changes = sheet.getByRole('list', { name: 'Nilai yang berubah' });
    await expect(changes).toContainText('viewer');
    await expect(changes).toContainText('fleet_manager');
  });
});
