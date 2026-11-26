import { describe, expect, it } from 'vitest';

import { permissionsOfRoles } from '@/shared/auth/permissions';
import { defineFeature, type FeatureModule } from '@/shared/feature';
import { i18n } from '@/shared/i18n';

import { features } from './features';
import {
  buildNavigation,
  singleSlotComponent,
  slotContributions,
  validateFeatures,
} from './navigation';

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
          '/surveillance',
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

describe('shell slots', () => {
  const A = () => null;
  const B = () => null;
  const C = () => null;
  const modules: FeatureModule[] = [
    defineFeature({ id: 'alert-rules', slots: { 'topbar.actions': { component: B, order: 20 } } }),
    defineFeature({
      id: 'alerts',
      slots: {
        'topbar.alerts': A,
        'topbar.actions': [
          { component: A, order: 10 },
          { component: C, order: 20 },
        ],
      },
    }),
    defineFeature({ id: 'zones', slots: { 'sidebar.footer': C } }),
  ];

  it('renders every contribution of a shared slot in order, then by feature id', () => {
    expect(
      slotContributions(modules, 'topbar.actions').map(({ featureId, order, component }) => [
        featureId,
        order,
        component,
      ]),
    ).toEqual([
      ['alerts', 10, A],
      ['alert-rules', 20, B],
      ['alerts', 20, C],
    ]);
    expect(slotContributions(modules, 'sidebar.footer')).toMatchObject([
      { featureId: 'zones', order: 100, component: C, key: 'zones:0' },
    ]);
  });

  it('keeps a single owner for the alert bell', () => {
    expect(singleSlotComponent(modules, 'topbar.alerts')).toBe(A);
    const twice = [...modules, defineFeature({ id: 'safety', slots: { 'topbar.alerts': B } })];
    expect(() => singleSlotComponent(twice, 'topbar.alerts')).toThrow(/"alerts" and "safety"/);
  });

  it('validates the discovered feature modules at startup', () => {
    const at = (id: string) => `../features/${id}/routes.tsx`;
    expect(
      validateFeatures([
        { path: at('zones'), feature: defineFeature({ id: 'zones' }) },
        { path: at('alerts'), feature: defineFeature({ id: 'alerts' }) },
      ]).map((feature) => feature.id),
    ).toEqual(['alerts', 'zones']);
    expect(() => validateFeatures([{ path: at('cii'), feature: undefined }])).toThrow(
      /must export "feature"/,
    );
    expect(() =>
      validateFeatures([{ path: at('cii'), feature: defineFeature({ id: 'emission' }) }]),
    ).toThrow(/must equal its folder name "cii"/);
    expect(() =>
      validateFeatures([
        {
          path: at('alerts'),
          feature: defineFeature({ id: 'alerts', slots: { 'topbar.alerts': A } }),
        },
        {
          path: at('safety'),
          feature: defineFeature({ id: 'safety', slots: { 'topbar.alerts': B } }),
        },
      ]),
    ).toThrow(/single owner/);
  });
});
