import type { RealtimeAlert } from '@darmawanweb/ais-its-contracts/realtime';
import { expect, test, type Page } from '@playwright/test';

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

const raisedAlert = (): RealtimeAlert => ({
  id: '0192f0c8-7d3a-7c2e-9a1b-00000000da5b',
  type: 'ews',
  domain: 'safety',
  severity: 'warning',
  status: 'open',
  mmsi: 525019003,
  relatedMmsi: null,
  title: 'Peringatan EWS: KM Kepri Indah',
  message: 'KM Kepri Indah melambat 420 m dari Pipa Gas Batam.',
  lat: 1.16,
  lon: 103.88,
  zoneId: null,
  methodId: 'ews.pipeline_distance_status',
  occurredAt: new Date().toISOString(),
  lastOccurredAt: new Date().toISOString(),
  occurrences: 1,
  data: { status: 1, distanceM: 420 },
});

async function useTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ais-ui', JSON.stringify({ state: { theme: value }, version: 1 }));
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

test.describe('fleet: dashboard', () => {
  test.beforeEach(async () => {
    await resetMockGateway();
  });

  test('shows the operations overview and counts alerts pushed in realtime', async ({ page }) => {
    await login(page, USERS.manager);
    const main = page.locator('#main-content');

    for (const label of ['Kapal aktif', 'Pesan AIS', 'Alert terbuka', 'EWS pipa']) {
      await expect(main.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(main.getByText(/^Utama \d+ · Batam \d+ · Mitra \d+$/)).toBeVisible();
    for (const heading of [
      'Alert 7 hari terakhir',
      'Pengawasan 24 jam',
      'Peta armada',
      'Alert terbaru',
      'Laju pesan AIS per sumber',
    ]) {
      await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    await expect(main.getByRole('heading', { level: 2, name: /^CII armada \d{4}/ })).toBeVisible();
    await expect(main.getByRole('list', { name: 'Jumlah kapal per peringkat CII' })).toBeVisible();
    await expect(main.getByText('Bahan bakar bulan ini')).toBeVisible();
    await expect(main.getByText(/Data cuaca oleh Open-Meteo/)).toBeVisible();
    await expect(page.getByTestId('dashboard-map').locator('canvas').first()).toBeVisible();

    // Realtime: a raised alert is counted until the next manual refresh.
    await expectRealtimeConnected(page);
    await expect(page.getByTestId('dashboard-live')).toHaveText('Realtime terhubung');
    await waitForRealtimeRoom(FLEET_ORG_ROOM);
    await pushRealtime({ kind: 'alert', alert: raisedAlert() });
    await expect(page.getByTestId('new-alerts')).toHaveText('+1 baru sejak dibuka');
    await page.getByRole('button', { name: 'Perbarui' }).click();
    await expect(page.getByTestId('new-alerts')).toHaveCount(0);

    expect(await axeViolations(page)).toEqual([]);

    await main.getByRole('link', { name: 'Lihat alert' }).click();
    await expect(page).toHaveURL(/\/alerts/);
  });

  test('a failing service only affects its own card', async ({ page }) => {
    await page.route('**/api/v2/surveillance/stats**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Service unavailable',
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }),
      }),
    );
    await login(page, USERS.manager);
    const card = page.locator('section', {
      has: page.getByRole('heading', { level: 2, name: 'Pengawasan 24 jam' }),
    });
    await expect(card.getByRole('button', { name: /Coba lagi/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Alert terbaru' })).toBeVisible();
    await expect(page.getByText('Kapal aktif', { exact: true })).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`fits a phone without horizontal scroll (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, USERS.manager);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await axeViolations(page), theme).toEqual([]);
    });
  }
});
