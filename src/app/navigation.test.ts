import { describe, expect, it } from 'vitest';

import { permissionsOfRoles } from '@/shared/auth/permissions';
import { i18n } from '@/shared/i18n';

import { features } from './features';
import { buildNavigation } from './navigation';

describe('feature modules', () => {
  it('discovers every feature folder', () => {
    expect(features.map((feature) => feature.id)).toEqual([
      'admin',
      'alert-rules',
      'alerts',
      'auth',
      'cii',
      'dashboard',
      'map',
      'methodology',
      'profile',
      'safety',
      'seemp',
      'surveillance',
      'telemetry',
      'vessels',
      'zones',
    ]);
  });

  it('declares unique route paths and nav ids', () => {
    const paths = features.flatMap((feature) => (feature.routes ?? []).map((route) => route.path));
    expect(new Set(paths).size).toBe(paths.length);
    const navIds = features.flatMap((feature) => (feature.nav ?? []).map((item) => item.id));
    expect(new Set(navIds).size).toBe(navIds.length);
  });

  it('has Indonesian and English labels for every nav entry', () => {
    for (const item of features.flatMap((feature) => feature.nav ?? [])) {
      for (const language of ['id', 'en']) {
        expect(
          i18n.exists(item.labelKey, { lng: language }),
          `${item.labelKey} (${language})`,
        ).toBe(true);
      }
    }
  });
});

describe('buildNavigation', () => {
  const labels = (roles: Parameters<typeof permissionsOfRoles>[0]): [string, string[]][] =>
    buildNavigation(features, permissionsOfRoles(roles)).map((section) => [
      section.id,
      section.items.map((item) => item.path),
    ]);

  it('orders the sections and items of the spec for super_admin', () => {
    expect(labels(['super_admin'])).toEqual([
      ['operations', ['/map', '/alerts']],
      ['safety', ['/safety/ews', '/safety/collision']],
      [
        'surveillance',
        [
          '/surveillance/transhipment',
          '/surveillance/fishing',
          '/surveillance/dark',
          '/surveillance/anomaly',
        ],
      ],
      ['fleet', ['/dashboard', '/vessels', '/cii', '/seemp', '/telemetry']],
      [
        'settings',
        [
          '/zones',
          '/alert-rules',
          '/admin/organizations',
          '/admin/members',
          '/admin/api-keys',
          '/admin/reference-data',
          '/admin/devices',
          '/admin/audit-log',
        ],
      ],
      ['knowledge', ['/methodology']],
    ]);
  });

  it('hides entries without permission (authority)', () => {
    const navigation = Object.fromEntries(labels(['authority']));
    expect(navigation.fleet).toEqual(['/dashboard', '/vessels']);
    expect(navigation.settings).toEqual(['/zones', '/alert-rules', '/admin/reference-data']);
    expect(navigation.knowledge).toEqual(['/methodology']);
  });

  it('always shows the methodology to signed-in users', () => {
    expect(Object.fromEntries(labels(['viewer'])).knowledge).toEqual(['/methodology']);
  });
});
