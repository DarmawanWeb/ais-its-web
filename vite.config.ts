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
            groups: [
              { name: 'vendor-maplibre', test: /[\\/]node_modules[\\/].*maplibre-gl/ },
              {
                name: 'vendor-deckgl',
                test: /[\\/]node_modules[\\/].*@(deck\.gl|luma\.gl|loaders\.gl|math\.gl|probe\.gl)[\\/]/,
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
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
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
