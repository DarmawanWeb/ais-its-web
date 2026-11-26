import { Hexagon } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Zones and geofences (geo service, spec §13.6). */
export const feature = defineFeature({
  id: 'zones',
  i18n: { id, en },
  routes: [
    {
      path: 'zones',
      handle: { titleKey: 'zones:zones.title', permission: 'zone:read' },
      lazy: lazyPage(() => import('./pages/zones-page'), 'ZonesPage'),
    },
    {
      path: 'zones/new',
      handle: { titleKey: 'zones:editor.newTitle', permission: 'zone:write', layout: 'full-bleed' },
      lazy: lazyPage(() => import('./pages/zone-editor-page'), 'ZoneEditorPage'),
    },
    {
      path: 'zones/:id',
      handle: { titleKey: 'zones:editor.title', permission: 'zone:read', layout: 'full-bleed' },
      lazy: lazyPage(() => import('./pages/zone-editor-page'), 'ZoneEditorPage'),
    },
  ],
  nav: [
    {
      id: 'zones.zones',
      section: 'settings',
      order: 10,
      path: '/zones',
      labelKey: 'zones:nav.zones',
      icon: Hexagon,
      permission: 'zone:read',
      keywords: ['zona', 'zone', 'geofence', 'pipa', 'labuh', 'pelabuhan', 'geojson'],
    },
  ],
});
