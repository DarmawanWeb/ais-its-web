import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';
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

/** Organization of the demo fleet (e2e/mock-server/lib.mjs ORGS[0]). */
const FLEET_ORG_ROOM = 'org:0192f0c8-7d3a-7c2e-9a1b-000000000001';

const liveAlert = (): RealtimeAlert => ({
  id: '0192f0c8-7d3a-7c2e-9a1b-00000000beef',
  type: 'collision',
  domain: 'safety',
  severity: 'critical',
  status: 'open',
  mmsi: 525019006,
  relatedMmsi: 525019009,
  title: 'Risiko tubrukan tinggi: KM Rempang ↔ MV Combi Tanjung',
  message: 'CPA 0,12 nm dalam 3,1 menit (pita tinggi).',
  lat: 1.02,
  lon: 103.93,
  zoneId: null,
  methodId: 'collision.cpa_tcpa',
  occurredAt: new Date().toISOString(),
  lastOccurredAt: new Date().toISOString(),
  occurrences: 1,
  data: { risk: 'high', cpaNm: 0.12, tcpaMin: 3.1 },
});

test.describe('alerts inbox (operations)', () => {
  test.beforeEach(() => resetMockGateway());
  test.afterAll(() => resetMockGateway());

  test('filters, detail drawer, acknowledge and resolve with confirmation', async ({ page }) => {
    await login(page, USERS.manager);
    const bell = page.getByTestId('alerts-bell');
    await expect(bell).toHaveAttribute('aria-label', 'Alert, 3 terbuka');

    await page.goto('/alerts');
    await expect(page.getByRole('heading', { level: 1, name: 'Alert' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Kotak masuk alert' });
    await expect(table.getByRole('row')).toHaveCount(4);

    await page.getByRole('combobox', { name: 'Tingkat' }).click();
    await page.getByRole('option', { name: 'Kritis' }).click();
    await expect(page).toHaveURL(/severity=critical/);
    await expect(table.getByRole('row')).toHaveCount(2);

    await table.getByRole('row', { name: /Bahaya EWS/ }).click();
    await expect(page).toHaveURL(/alert=/);
    const detail = page.getByTestId('alert-detail');
    await expect(
      detail.getByRole('heading', { name: /Bahaya EWS: KM Bahari Nusantara/ }),
    ).toBeVisible();
    await expect(detail.getByText('Linimasa kejadian')).toBeVisible();
    await expect(detail.getByText('Jarak ke pipa')).toBeVisible();
    await expect(detail.getByTestId('alert-mini-map')).toBeVisible();
    await expect(detail.getByRole('button', { name: /Sumber metode/ }).first()).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await detail.getByRole('button', { name: 'Terima', exact: true }).click();
    await expect(page.getByText('Alert diterima')).toBeVisible();
    await expect(detail.getByText('Diterima').first()).toBeVisible();
    await expect(bell).toHaveAttribute('aria-label', 'Alert, 2 terbuka');

    await detail.getByRole('button', { name: 'Selesaikan', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Selesaikan alert ini?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Selesaikan', exact: true }).click();
    await expect(page.getByText('Alert diselesaikan')).toBeVisible();
    await expect(detail.getByText('Diselesaikan').first()).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/alert=/);
  });

  test('new alerts appear live, critical ones raise a toast', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/alerts');
    await expectRealtimeConnected(page);
    await waitForRealtimeRoom(FLEET_ORG_ROOM);
    const table = page.getByRole('table', { name: 'Kotak masuk alert' });
    await expect(table.getByRole('row')).toHaveCount(4);

    await pushRealtime({ kind: 'alert', alert: liveAlert() });
    const row = table.getByRole('row', { name: /KM Rempang ↔ MV Combi Tanjung/ });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('alert-fresh')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: /Notifications/i })
        .getByText(/KM Rempang ↔ MV Combi Tanjung/),
    ).toBeVisible();

    // An update of another user (acknowledged elsewhere) patches the row in place.
    await pushRealtime({
      kind: 'alert',
      alert: { ...liveAlert(), status: 'acknowledged' },
      event: 'updated',
    });
    await expect(row.getByText('Diterima')).toBeVisible();
  });

  test('bell popover shows the latest alerts and opens one in the inbox', async ({ page }) => {
    await login(page, USERS.manager);
    await page.getByTestId('alerts-bell').click();
    const popover = page.getByRole('dialog');
    await expect(popover.getByText('3 alert terbuka')).toBeVisible();
    const latest = popover.getByRole('list', { name: 'Alert terbaru' });
    await expect(latest.getByRole('link')).toHaveCount(6);
    await latest.getByRole('link', { name: /Kapal gelap: Ocean Bulk Star/ }).click();
    await expect(page).toHaveURL(/\/alerts\?alert=.+&status=all/);
    await expect(
      page
        .getByTestId('alert-detail')
        .getByRole('heading', { name: 'Kapal gelap: Ocean Bulk Star' }),
    ).toBeVisible();
  });

  test('CSV export downloads the filtered alerts', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/alerts?status=all&domain=safety');
    // 6 safety alerts of the mock (every status) + the header row.
    await expect(
      page.getByRole('table', { name: 'Kotak masuk alert' }).getByRole('row'),
    ).toHaveCount(7);
    const download = page.waitForEvent('download');
    await page.getByTestId('alerts-export').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^alerts-\d{8}-\d{4}\.csv$/);
    const text = await (await file.createReadStream()).toArray();
    const csv = Buffer.concat(text).toString('utf8');
    expect(csv).toContain('Judul');
    expect(csv.trim().split('\n')).toHaveLength(7);
    expect(csv).not.toContain('Kapal gelap');
  });
});
