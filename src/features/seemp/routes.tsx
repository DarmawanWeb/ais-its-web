import { ClipboardCheck } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** SEEMP recommendations and simulation (emission service, spec §13.5). */
export const feature = defineFeature({
  id: 'seemp',
  i18n: { id, en },
  routes: [
    {
      path: 'seemp',
      handle: { titleKey: 'seemp:seemp.title', permission: 'seemp:read' },
      lazy: lazyPage(() => import('./pages/seemp-page'), 'SeempPage'),
    },
    {
      path: 'seemp/vessels/:mmsi',
      handle: { titleKey: 'seemp:vessel.title', permission: 'seemp:read' },
      lazy: lazyPage(() => import('./pages/seemp-vessel-page'), 'SeempVesselPage'),
    },
  ],
  nav: [
    {
      id: 'seemp.seemp',
      section: 'fleet',
      order: 40,
      path: '/seemp',
      labelKey: 'seemp:nav.seemp',
      icon: ClipboardCheck,
      permission: 'seemp:read',
      keywords: [
        'seemp',
        'efisiensi',
        'efficiency',
        'simulasi',
        'simulation',
        'skenario',
        'scenario',
      ],
    },
  ],
});
