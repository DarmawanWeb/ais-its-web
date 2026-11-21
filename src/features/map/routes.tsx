import { Map as MapIcon } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Live map (MapLibre + deck.gl, realtime positions and safety states). */
export const feature = defineFeature({
  id: 'map',
  i18n: { id, en },
  routes: [
    {
      path: 'map',
      handle: { titleKey: 'map:title', permission: 'ais:read', layout: 'full-bleed' },
      lazy: lazyPage(() => import('./pages/live-map-page'), 'LiveMapPage'),
    },
  ],
  nav: [
    {
      id: 'map.live',
      section: 'operations',
      order: 10,
      path: '/map',
      labelKey: 'map:nav.live',
      icon: MapIcon,
      permission: 'ais:read',
      keywords: ['peta', 'map', 'live', 'ais', 'posisi'],
    },
  ],
});
