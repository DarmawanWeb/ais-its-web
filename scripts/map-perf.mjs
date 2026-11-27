#!/usr/bin/env node
/**
 * Live map performance check with 10 000 vessels (`pnpm perf:map`).
 *
 * Needs a running production build with e2e hooks and the mock gateway, e.g.
 *   E2E_WEB_PORT=4574 E2E_MOCK_PORT=8974 pnpm exec playwright test e2e/smoke.spec.ts   (builds once)
 * or by hand:
 *   MOCK_PORT=8974 node e2e/mock-server/server.mjs &
 *   VITE_DEV_PROXY_TARGET=http://localhost:8974 pnpm exec vite preview --outDir <build> --port 4574
 * then: PERF_WEB_URL=http://localhost:4574 PERF_MOCK_URL=http://localhost:8974 pnpm perf:map
 *
 * Measures, in headless Chromium (software WebGL unless PERF_GPU=true): frame times while the
 * map pans with the 14 demo vessels and with 10 000 pushed vessels, the time until the count
 * shows them, and the JS heap. Prints a JSON summary.
 */
/* global window, document, requestAnimationFrame -- page.evaluate callbacks run in the browser */
import { chromium } from '@playwright/test';

const WEB = process.env.PERF_WEB_URL ?? 'http://localhost:4574';
const MOCK = process.env.PERF_MOCK_URL ?? 'http://localhost:8974';
const VESSELS = Number(process.env.PERF_VESSELS ?? 10_000);
const GPU = process.env.PERF_GPU === 'true';

const args = GPU
  ? ['--ignore-gpu-blocklist', '--enable-precise-memory-info']
  : [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-precise-memory-info',
    ];

async function push(items) {
  const response = await fetch(`${MOCK}/__mock/realtime`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'positions', items }),
  });
  if (!response.ok) throw new Error(`push failed: ${response.status} ${await response.text()}`);
}

/** Pans the map for `ms` and returns the frame-time statistics of that window. */
async function panFrames(page, ms = 3_000) {
  return page.evaluate(async (duration) => {
    const maps = window.__AIS_E2E_MAPS__ ?? [];
    const map = maps.at(-1);
    if (!map) throw new Error('no live map (build without VITE_E2E_HOOKS?)');
    const deltas = [];
    let last = performance.now();
    let running = true;
    const loop = (now) => {
      deltas.push(now - last);
      last = now;
      if (running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const start = performance.now();
    // back and forth so the view stays over the vessels
    while (performance.now() - start < duration) {
      map.panBy([240, 120], { duration: 500 });
      await new Promise((resolve) => setTimeout(resolve, 520));
      map.panBy([-240, -120], { duration: 500 });
      await new Promise((resolve) => setTimeout(resolve, 520));
    }
    running = false;
    const sorted = deltas.slice(1).sort((a, b) => a - b);
    const avg = sorted.reduce((sum, d) => sum + d, 0) / Math.max(1, sorted.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return {
      frames: sorted.length,
      avgFrameMs: Number(avg.toFixed(1)),
      p95FrameMs: Number(p95.toFixed(1)),
      fps: Number((1000 / avg).toFixed(1)),
    };
  }, ms);
}

async function heapMb(page) {
  const cdp = await page.context().newCDPSession(page);
  // getMetrics answers an empty list until the domain is enabled.
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  return Number((used / 1024 / 1024).toFixed(1));
}

const browser = await chromium.launch({ args });
const context = await browser.newContext({
  baseURL: WEB,
  viewport: { width: 1440, height: 900 },
  locale: 'id-ID',
});
const page = await context.newPage();
await page
  .context()
  .newCDPSession(page)
  .then((cdp) => cdp.send('Performance.enable'));

await page.goto('/login');
await page.getByLabel('Email').fill('admin@ais-its.local');
await page.getByLabel('Kata sandi', { exact: true }).fill('ChangeMe123!');
await page.getByRole('button', { name: 'Masuk', exact: true }).click();
await page.waitForURL(/\/dashboard$/);
await page.goto('/map?lat=1.14300&lon=103.85700&z=10&layers=vessels');
const count = page.getByTestId('vessel-count');
await count.filter({ hasText: /\d+/ }).waitFor();
await page.waitForTimeout(2_000);

const baseline = { vessels: Number(await count.textContent()), ...(await panFrames(page)) };
const heapBefore = await heapMb(page);

const time = new Date().toISOString();
const side = Math.ceil(Math.sqrt(VESSELS));
const position = (k) => ({
  mmsi: 400_000_000 + k,
  time,
  lat: 1.143 + ((k % side) - side / 2) * 0.0035,
  lon: 103.857 + (Math.floor(k / side) - side / 2) * 0.006,
  sog: 8,
  cog: (k * 37) % 360,
  hdg: (k * 37) % 360,
  navstatus: 0,
  predictedNavstatus: 0,
  source: 'primary',
});
const started = Date.now();
for (let offset = 0; offset < VESSELS; offset += 2_000)
  await push(
    Array.from({ length: Math.min(2_000, VESSELS - offset) }, (_, i) => position(offset + i)),
  );
await page.waitForFunction(
  (expected) =>
    Number(document.querySelector('[data-testid="vessel-count"]')?.textContent) >= expected,
  Math.floor(VESSELS * 0.9),
  { timeout: 60_000 },
);
const visibleAfterMs = Date.now() - started;
await page.waitForTimeout(1_500);
const loaded = { vessels: Number(await count.textContent()), ...(await panFrames(page)) };
const heapAfter = await heapMb(page);

const result = {
  renderer: GPU ? 'gpu' : 'swiftshader (software WebGL)',
  pushedVessels: VESSELS,
  countVisibleAfterMs: visibleAfterMs,
  baseline,
  loaded,
  jsHeapMb: {
    before: heapBefore,
    after: heapAfter,
    delta: Number((heapAfter - heapBefore).toFixed(1)),
  },
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
