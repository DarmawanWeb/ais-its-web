import { Plus, Ship } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/**
 * Vessel master data (fleet service, spec §13.3). Detail route contract: /vessels/:mmsi
 * (used by the command palette and the live map).
 */
export const feature = defineFeature({
  id: 'vessels',
  i18n: { id, en },
  routes: [
    {
      path: 'vessels',
      handle: { titleKey: 'vessels:list.title', permission: 'vessel:read' },
      lazy: lazyPage(() => import('./pages/list-page'), 'ListPage'),
    },
    {
      path: 'vessels/new',
      handle: { titleKey: 'vessels:form.createTitle', permission: 'vessel:write' },
      lazy: lazyPage(() => import('./pages/form-page'), 'VesselCreatePage'),
    },
    {
      path: 'vessels/:mmsi',
      handle: { titleKey: 'vessels:detail.title', permission: 'vessel:read' },
      lazy: lazyPage(() => import('./pages/detail-page'), 'DetailPage'),
    },
    {
      path: 'vessels/:mmsi/edit',
      handle: { titleKey: 'vessels:form.editTitle', permission: 'vessel:write' },
      lazy: lazyPage(() => import('./pages/form-page'), 'VesselEditPage'),
    },
  ],
  nav: [
    {
      id: 'vessels.list',
      section: 'fleet',
      order: 20,
      path: '/vessels',
      labelKey: 'vessels:nav.list',
      icon: Ship,
      permission: 'vessel:read',
      keywords: ['kapal', 'vessel', 'mmsi', 'imo', 'armada', 'fleet'],
    },
  ],
  commands: [
    {
      id: 'vessels.create',
      labelKey: 'vessels:commands.create',
      icon: Plus,
      permission: 'vessel:write',
      perform: ({ navigate }) => void navigate('/vessels/new'),
    },
  ],
});
