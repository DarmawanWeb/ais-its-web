import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Demo accounts of the mock gateway (e2e/mock-server/server.mjs). */
export const USERS = {
  admin: { email: 'admin@ais-its.local', password: 'ChangeMe123!' },
  manager: { email: 'manager@pelni.test', password: 'Kapal12345' },
} as const;

/** Signs in through the login form (on the current page when `navigate` is false). */
export async function login(
  page: Page,
  user: { email: string; password: string } = USERS.admin,
  { navigate = true }: { navigate?: boolean } = {},
) {
  if (navigate) await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard Armada' })).toBeVisible();
}

/**
 * WCAG 2.1 A/AA violations of axe-core on the current page, one readable line per node
 * (`expect(await axeViolations(page)).toEqual([])`).
 */
export async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id}: ${node.target.join(' ')} ${node.html.slice(0, 160)} — ${node.failureSummary ?? ''}`,
    ),
  );
}

/** Paths of every sidebar entry the signed-in user can see. */
export async function navigationPaths(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: 'Navigasi utama' })
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
}
