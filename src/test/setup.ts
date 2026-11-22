import '@testing-library/jest-dom/vitest';
import '@/shared/i18n';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { resetSessionForTests } from '@/shared/auth/session';
import { i18n } from '@/shared/i18n';

import { resetAuthMock } from './msw/auth-handlers';
import { server } from './msw/server';

// jsdom gaps used by Radix UI, cmdk and the shell.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.scrollTo = () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;

// jsdom has no Web Locks API: a FIFO exclusive lock per name, like browsers in secure
// contexts. The localStorage fallback (src/shared/auth/cross-tab-lock.ts) has its own tests.
if (!('locks' in navigator) || !navigator.locks) {
  const queues = new Map<string, Promise<unknown>>();
  const locks = {
    request(name: string, ...args: unknown[]): Promise<unknown> {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      const run = (queues.get(name) ?? Promise.resolve()).then(() => callback());
      queues.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
    query: () => Promise.resolve({ held: [], pending: [] }),
  };
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  void i18n.changeLanguage('id');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetAuthMock();
  resetSessionForTests();
  window.localStorage.clear();
});

afterAll(() => server.close());
