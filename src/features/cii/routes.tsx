import { Leaf } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Carbon Intensity Indicator (emission service, spec §13.5). */
export const feature = defineFeature({
  id: 'cii',
  i18n: { id, en },
  routes: [
    {
      path: 'cii',
      handle: { titleKey: 'cii:cii.title', permission: 'cii:read' },
      lazy: lazyPage(() => import('./pages/cii-page'), 'CiiPage'),
    },
    {
      path: 'cii/reduction-factors',
      handle: { titleKey: 'cii:factors.title', permission: 'cii:read' },
      lazy: lazyPage(() => import('./pages/reduction-factors-page'), 'ReductionFactorsPage'),
    },
    {
      path: 'cii/vessels/:mmsi',
      handle: { titleKey: 'cii:vessel.title', permission: 'cii:read' },
      lazy: lazyPage(() => import('./pages/cii-vessel-page'), 'CiiVesselPage'),
    },
  ],
  nav: [
    {
      id: 'cii.cii',
      section: 'fleet',
      order: 30,
      path: '/cii',
      labelKey: 'cii:nav.cii',
      icon: Leaf,
      permission: 'cii:read',
      keywords: ['cii', 'emisi', 'emission', 'co2', 'karbon', 'carbon', 'dcs', 'imo'],
    },
  ],
});
