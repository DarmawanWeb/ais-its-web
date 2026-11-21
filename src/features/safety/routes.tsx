import { Cable, Radar } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Navigational safety: pipeline EWS and collision risk (safety service, spec §13.7). */
export const feature = defineFeature({
  id: 'safety',
  i18n: { id, en },
  routes: [
    {
      path: 'safety/ews',
      handle: { titleKey: 'safety:ews.title', permission: 'safety:read' },
      lazy: lazyPage(() => import('./pages/ews-page'), 'EwsPage'),
    },
    {
      path: 'safety/collision',
      handle: { titleKey: 'safety:collision.title', permission: 'safety:read' },
      lazy: lazyPage(() => import('./pages/collision-page'), 'CollisionPage'),
    },
  ],
  nav: [
    {
      id: 'safety.ews',
      section: 'safety',
      order: 10,
      path: '/safety/ews',
      labelKey: 'safety:nav.ews',
      icon: Cable,
      permission: 'safety:read',
      keywords: ['ews', 'pipa', 'pipeline'],
    },
    {
      id: 'safety.collision',
      section: 'safety',
      order: 20,
      path: '/safety/collision',
      labelKey: 'safety:nav.collision',
      icon: Radar,
      permission: 'safety:read',
      keywords: ['cpa', 'tcpa', 'tubrukan', 'collision'],
    },
  ],
});
