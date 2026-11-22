import { describe, expect, it } from 'vitest';

import { HOME_PATH, loginPath, safeRedirect } from './paths';

const ORIGIN = 'https://console.ais-its.example';

describe('safeRedirect', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeRedirect('/vessels/525005223?tab=track#map', ORIGIN)).toBe(
      '/vessels/525005223?tab=track#map',
    );
    expect(safeRedirect('/cii', ORIGIN)).toBe('/cii');
  });

  it.each([
    ['empty', ''],
    ['missing', null],
    ['absolute URL', 'https://evil.example/x'],
    ['protocol-relative', '//evil.example'],
    ['backslash', '/\\evil.example'],
    ['backslashes', '/\\\\evil.example'],
    ['tab', '/\t/evil.example'],
    ['newline', '/\n/evil.example'],
    ['relative', 'dashboard'],
    ['javascript', 'javascript:alert(1)'],
    ['login page', '/login?redirect=/x'],
    ['reset page', '/reset-password#token=abc'],
  ])('falls back to the home page for %s targets', (_, target) => {
    expect(safeRedirect(target, ORIGIN)).toBe(HOME_PATH);
  });

  it('normalizes dot segments like the browser does', () => {
    expect(safeRedirect('/a/../cii', ORIGIN)).toBe('/cii');
  });
});

describe('loginPath', () => {
  it('carries the current page as redirect', () => {
    expect(loginPath('/cii?year=2025')).toBe('/login?redirect=%2Fcii%3Fyear%3D2025');
    expect(loginPath('/')).toBe('/login');
  });
});
