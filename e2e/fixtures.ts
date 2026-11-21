import { expect, type Page } from '@playwright/test';

/** Demo accounts of the mock gateway (e2e/mock-server/server.mjs). */
export const USERS = {
  admin: { email: 'admin@ais-its.local', password: 'ChangeMe123!' },
  manager: { email: 'manager@pelni.test', password: 'Kapal12345' },
} as const;

export async function login(page: Page, user: { email: string; password: string } = USERS.admin) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Masuk ke konsol' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard Armada' })).toBeVisible();
}
