import AxeBuilder from '@axe-core/playwright';
import type { CiiUpdatedV1 } from '@darmawanweb/ais-its-contracts/events';
import type {
  RealtimeAlert,
  RealtimePosition,
  RealtimeSafetyState,
} from '@darmawanweb/ais-its-contracts/realtime';
import { expect, type Page } from '@playwright/test';

/** Demo accounts of the mock gateway (e2e/mock-server/server.mjs). */
export const USERS = {
  admin: { email: 'admin@ais-its.local', password: 'ChangeMe123!' },
  manager: { email: 'manager@pelni.test', password: 'Kapal12345' },
  // role walkthrough accounts (e2e/roles.spec.ts; ROLE_USERS of the mock gateway)
  orgAdmin: { email: 'orgadmin@pelni.test', password: 'Kapal12345' },
  authority: { email: 'petugas@ksop-batam.test', password: 'Kapal12345' },
  viewer: { email: 'viewer@pelni.test', password: 'Kapal12345' },
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

// --- mock gateway (e2e/mock-server) ---------------------------------------------------------

/** The mock gateway of this run (started by playwright.config.ts; test controls only). */
export const MOCK_GATEWAY_URL = `http://localhost:${process.env.E2E_MOCK_PORT ?? 8787}`;

/** A realtime push through the mock socket.io server (validated with the contracts schemas). */
export type MockRealtimeMessage =
  /** `positions` batch per tile room (+ `tile:all`) and `vessel:position` per vessel room. */
  | { kind: 'positions'; items: RealtimePosition[] }
  /** `safety:states` batch per tile room (+ `tile:all`) and `vessel:safety` per vessel room. */
  | { kind: 'safety:states'; items: RealtimeSafetyState[] }
  /** `alert:raised` / `alert:updated` to `authority` and `org:<id>` (default: the demo fleet owner). */
  | { kind: 'alert'; alert: RealtimeAlert; event?: 'raised' | 'updated'; orgIds?: string[] }
  /** `cii:updated` to `org:<update.orgId>`. */
  | { kind: 'cii:updated'; update: CiiUpdatedV1 }
  /** Any event to rooms (default: every connection), not validated. */
  | { kind: 'emit'; event: string; payload: unknown; rooms?: string[] };

export interface MockRealtimeConnection {
  id: string;
  userId: string | null;
  orgId: string | null;
  roles: string[];
  /** `user:<id>`, `org:<id>`, `authority`, `tile:6:<x>:<y>` / `tile:all`, `vessel:<mmsi>`. */
  rooms: string[];
}

async function mockGateway(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${MOCK_GATEWAY_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(
      `mock gateway ${init?.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return response;
}

/**
 * Pushes a realtime event to the app through the mock socket.io server. Wait for the room first
 * (`waitForRealtimeRoom`): events to rooms nobody joined yet are lost, like in production.
 */
export async function pushRealtime(message: MockRealtimeMessage): Promise<void> {
  await mockGateway('/__mock/realtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

/** Realtime connections of the mock gateway and their rooms. */
export async function realtimeConnections(): Promise<MockRealtimeConnection[]> {
  const response = await mockGateway('/__mock/realtime');
  return ((await response.json()) as { connections: MockRealtimeConnection[] }).connections;
}

/**
 * Waits until a realtime connection joined `room`: an exact name (`vessel:525005223`) or a
 * RegExp (`/^tile:/` once a live map sent its viewport).
 */
export async function waitForRealtimeRoom(room: string | RegExp, timeout = 15_000): Promise<void> {
  const matches = (name: string) => (typeof room === 'string' ? name === room : room.test(name));
  await expect
    .poll(async () => (await realtimeConnections()).some((c) => c.rooms.some(matches)), {
      message: `a realtime connection in room ${String(room)}`,
      timeout,
    })
    .toBe(true);
}

/** Waits until the app's realtime socket is connected (top bar indicator). */
export async function expectRealtimeConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected');
}

/**
 * Restores the initial state of every mock module (their `reset()` export). The mock gateway
 * lives for the whole run: call it in `test.beforeEach` of specs that change mock data.
 */
export async function resetMockGateway(): Promise<void> {
  await mockGateway('/__mock/reset', { method: 'POST' });
}
