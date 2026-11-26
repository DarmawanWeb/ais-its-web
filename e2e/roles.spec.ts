import { type Permission, ROLE_PERMISSIONS, type Role } from '@darmawanweb/ais-its-contracts';
import { expect, type Page, test } from '@playwright/test';

import { login, navigationPaths, resetMockGateway, USERS } from './fixtures';

/**
 * Role walkthrough (spec §8.4): every role signs in, opens every sidebar entry and the command
 * palette, and must never meet a 403 page, an action it cannot perform, a console error or a
 * missing translation (`[i18n] missing key …`, reported by e2e builds).
 */

/** Sidebar entries and the permission of each (`nav` of the features' routes.tsx). */
const NAV: readonly { path: string; permission?: Permission }[] = [
  { path: '/map', permission: 'ais:read' },
  { path: '/alerts', permission: 'alert:read' },
  { path: '/safety/ews', permission: 'safety:read' },
  { path: '/safety/collision', permission: 'safety:read' },
  { path: '/surveillance', permission: 'surveillance:read' },
  { path: '/surveillance/transhipment', permission: 'surveillance:read' },
  { path: '/surveillance/fishing', permission: 'surveillance:read' },
  { path: '/surveillance/dark', permission: 'surveillance:read' },
  { path: '/surveillance/anomaly', permission: 'surveillance:read' },
  { path: '/dashboard', permission: 'vessel:read' },
  { path: '/vessels', permission: 'vessel:read' },
  { path: '/cii', permission: 'cii:read' },
  { path: '/seemp', permission: 'seemp:read' },
  { path: '/telemetry', permission: 'telemetry:read' },
  { path: '/zones', permission: 'zone:read' },
  { path: '/alert-rules', permission: 'alert_rule:write' },
  { path: '/admin/organizations', permission: 'org:manage' },
  { path: '/admin/members', permission: 'user:manage' },
  { path: '/admin/api-keys', permission: 'api_key:manage' },
  { path: '/admin/reference-data', permission: 'vessel:read' },
  { path: '/admin/devices', permission: 'device:manage' },
  { path: '/admin/audit-log', permission: 'audit:read' },
  { path: '/methodology' },
];

/**
 * Actions that need a permission the page itself does not require: on `path`, a button or
 * link named `name` is visible exactly when the role has `permission`.
 */
const GATED_ACTIONS: readonly { path: string; name: RegExp; permission: Permission }[] = [
  { path: '/vessels', name: /^Tambah kapal$/, permission: 'vessel:write' },
  { path: '/zones', name: /^Zona baru$/, permission: 'zone:write' },
  { path: '/zones', name: /^Impor GeoJSON$/, permission: 'zone:write' },
  { path: '/telemetry', name: /^Input manual$/, permission: 'telemetry:write' },
  { path: '/admin/reference-data', name: /^Tipe kapal baru$/, permission: 'reference:write' },
];

/** Feature commands of the palette (`commands` of routes.tsx) and where they lead. */
const COMMANDS: readonly { name: string; permission: Permission; path: string }[] = [
  { name: 'Buka alert kritis', permission: 'alert:read', path: '/alerts' },
  { name: 'Tambah kapal baru', permission: 'vessel:write', path: '/vessels/new' },
];

const ACCOUNTS: readonly { role: Role; email: string; password: string }[] = [
  { role: 'super_admin', ...USERS.admin },
  { role: 'org_admin', ...USERS.orgAdmin },
  { role: 'fleet_manager', ...USERS.manager },
  { role: 'authority', ...USERS.authority },
  { role: 'viewer', ...USERS.viewer },
];

const can = (role: Role, permission?: Permission) =>
  !permission || role === 'super_admin' || ROLE_PERMISSIONS[role].includes(permission);

/** Resources of the app itself (the preview server and the mock gateway behind it). */
const isAppResource = (url: string) => {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
  } catch {
    return true;
  }
};

/**
 * Console errors, uncaught exceptions, missing translations and failed API calls of a page.
 * Third-party resources that cannot load in the offline test sandbox (basemap tiles) are not
 * problems of the app; everything served by the app or the gateway is.
 */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') {
      const source = message.location().url;
      if (text.startsWith('Failed to load resource') && source && !isAppResource(source)) return;
      problems.push(`console.error: ${text}`);
    } else if (text.includes('[i18n] missing key')) problems.push(text);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400)
      problems.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
  });
  return problems;
}

async function expectPageReady(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}(\\?.*)?$`));
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  // never the 403 of the shell (route permission) nor a forbidden state inside the page
  await expect(page.getByText('Akses ditolak', { exact: true })).toHaveCount(0);
  // let the page's queries settle (skeletons, lazy chunks) before the checks
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

test.describe('role walkthrough', () => {
  test.beforeAll(async () => {
    await resetMockGateway();
  });

  for (const account of ACCOUNTS) {
    test(`${account.role}: navigation, pages and palette`, async ({ page }) => {
      test.setTimeout(240_000);
      // Watched from the first signed-in page: the session restore attempt of the login page
      // (POST /auth/refresh without a cookie → 401) is the expected anonymous start.
      await login(page, account);
      const problems = watchProblems(page);

      const expected = NAV.filter((entry) => can(account.role, entry.permission)).map(
        (entry) => entry.path,
      );
      expect((await navigationPaths(page)).toSorted()).toEqual(expected.toSorted());

      const sidebar = page.getByRole('navigation', { name: 'Navigasi utama' });
      for (const path of expected) {
        await test.step(path, async () => {
          await sidebar.locator(`a[href="${path}"]`).click();
          await expectPageReady(page, path);
          for (const action of GATED_ACTIONS.filter((item) => item.path === path)) {
            const control = page
              .getByRole('main')
              .getByRole('button', { name: action.name })
              .or(page.getByRole('main').getByRole('link', { name: action.name }));
            if (can(account.role, action.permission)) await expect(control.first()).toBeVisible();
            else await expect(control).toHaveCount(0);
          }
        });
      }

      await test.step('command palette', async () => {
        const openPalette = async () => {
          await page.keyboard.press('ControlOrMeta+k');
          await expect(page.getByRole('dialog')).toBeVisible();
          return page.getByRole('dialog');
        };
        let palette = await openPalette();
        // the pages of the palette are the sidebar entries of the role (the rest are actions)
        const options = await palette.getByRole('option').count();
        const actions = await palette
          .getByRole('group', { name: 'Aksi', exact: true })
          .getByRole('option')
          .count();
        expect(options - actions).toBe(expected.length);
        for (const command of COMMANDS) {
          const option = palette.getByRole('option', { name: command.name, exact: true });
          if (!can(account.role, command.permission)) {
            await expect(option).toHaveCount(0);
            continue;
          }
          await option.click();
          await expectPageReady(page, command.path);
          palette = await openPalette();
        }
        await page.keyboard.press('Escape');
      });

      expect(problems, `problems of ${account.role}`).toEqual([]);
    });
  }
});
