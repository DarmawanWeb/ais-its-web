import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests and documentation screenshots against the production build (vite preview) and a
 * dependency-free mock gateway (e2e/mock-server/server.mjs + e2e/mock-server/routes/*.mjs).
 *
 *   pnpm test:e2e      every e2e/**\/*.spec.ts except the screenshots (headless; CI runs it)
 *   pnpm screenshots   refreshes docs/screenshots/*.png
 *
 * The build sets VITE_E2E_HOOKS=true: test hooks such as window.__AIS_E2E_MAPS__ (the live
 * MapLibre maps) exist only in this build.
 *
 * Runs in parallel (several engineers, one checkout): give each run its own ports,
 * `E2E_WEB_PORT=4273 E2E_MOCK_PORT=8887 pnpm test:e2e`. A run builds into
 * node_modules/.e2e/web-<port> and writes test-results/<port>, so runs never share files, and
 * servers already listening on the ports are an error unless E2E_REUSE_SERVERS=true (a reused
 * server may hold another run's build or mock modules).
 */
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 8787);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
const CI = !!process.env.CI;
const REUSE_SERVERS = !CI && process.env.E2E_REUSE_SERVERS === 'true';
const DIST_DIR = `node_modules/.e2e/web-${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: `./test-results/${WEB_PORT}`,
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // Software WebGL for MapLibre/deck.gl in headless Chromium.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    // Feature specs are picked up automatically: add e2e/<feature>.spec.ts (or a folder).
    { name: 'e2e', testMatch: /.*\.spec\.ts$/, testIgnore: /screenshots\.spec\.ts$/ },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts$/ },
  ],
  webServer: [
    {
      command: 'node e2e/mock-server/server.mjs',
      url: `http://localhost:${MOCK_PORT}/health`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: REUSE_SERVERS,
      stdout: 'ignore',
    },
    {
      command: `pnpm exec vite build --logLevel warn --outDir ${DIST_DIR} && pnpm exec vite preview --outDir ${DIST_DIR} --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        VITE_DEV_PROXY_TARGET: `http://localhost:${MOCK_PORT}`,
        VITE_QUERY_DEVTOOLS: 'false',
        VITE_E2E_HOOKS: 'true',
      },
      reuseExistingServer: REUSE_SERVERS,
      timeout: 180_000,
      stdout: 'ignore',
    },
  ],
});
