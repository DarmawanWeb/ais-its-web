/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

/**
 * Same-origin topology (docs/PLATFORM_SPEC.md §3, §12): in development the Vite dev
 * server proxies the API, the realtime socket, vector tiles and the JWKS to the Traefik
 * gateway (http://localhost:8000). Override with VITE_DEV_PROXY_TARGET (e.g. the e2e
 * mock server).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000';
  const proxy: Record<string, ProxyOptions> = {
    '/api': { target, changeOrigin: false },
    '/ws': { target, ws: true, changeOrigin: false },
    '/tiles': { target, changeOrigin: false },
    '/.well-known': { target, changeOrigin: false },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Traefik (host mode) reaches the dev server through host.docker.internal.
      host: true,
      proxy,
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
      proxy,
    },
    build: {
      target: 'es2022',
      // Maps are generated for error tracking but not referenced by the bundles.
      sourcemap: 'hidden',
      chunkSizeWarningLimit: 1600,
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks of the (lazy) map stack, cached across app releases.
          codeSplitting: {
            // A group captures its modules' dependencies too (Rolldown's default), so each vendor
            // chunk is self-contained: without that, deck.gl's dependency mjolnir.js landed in the
            // app's shared map chunk and the two chunks imported each other ("t is not a
            // constructor" at start-up). Vite's preload helper (used by every lazy import, also by
            // deck.gl) gets its own chunk first, or vendor-deckgl would capture it and load with
            // the entry. `pnpm bundle:report` checks both (initial load, import cycles).
            groups: [
              { name: 'preload-helper', test: /vite[\\/]preload-helper/, priority: 30 },
              {
                name: 'vendor-maplibre',
                test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-deckgl',
                test: /[\\/]node_modules[\\/]@(deck\.gl|luma\.gl|loaders\.gl|math\.gl|probe\.gl)[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'scripts/**/*.test.mjs',
        // Pure helpers of the e2e mock gateway (its protocol is covered by e2e/realtime.spec.ts).
        'e2e/mock-server/**/*.test.mjs',
      ],
      css: false,
      restoreMocks: true,
      reporters: ['dot'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/shared/api/generated/**', 'src/test/**', '**/*.test.{ts,tsx}'],
      },
    },
  };
});
