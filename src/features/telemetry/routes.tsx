import { Fuel } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Fuel telemetry and devices (telemetry service, spec §13.4). */
export const feature = defineFeature({
  id: 'telemetry',
  i18n: { id, en },
  routes: [
    {
      path: 'telemetry',
      handle: { titleKey: 'telemetry:telemetry.title', permission: 'telemetry:read' },
      lazy: lazyPage(() => import('./pages/telemetry-page'), 'TelemetryPage'),
    },
  ],
  nav: [
    {
      id: 'telemetry.telemetry',
      section: 'fleet',
      order: 50,
      path: '/telemetry',
      labelKey: 'telemetry:nav.telemetry',
      icon: Fuel,
      permission: 'telemetry:read',
      keywords: ['telemetri', 'bahan bakar', 'fuel'],
    },
  ],
});
