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
