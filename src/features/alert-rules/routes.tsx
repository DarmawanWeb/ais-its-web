import { SlidersHorizontal } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Alert routing rules (notification service, spec §13.9). */
export const feature = defineFeature({
  id: 'alert-rules',
  i18n: { id, en },
  routes: [
    {
      path: 'alert-rules',
      handle: { titleKey: 'alert-rules:rules.title', permission: 'alert_rule:write' },
      lazy: lazyPage(() => import('./pages/rules-page'), 'RulesPage'),
    },
  ],
  nav: [
    {
      id: 'alert-rules.rules',
      section: 'settings',
      order: 20,
      path: '/alert-rules',
      labelKey: 'alert-rules:nav.rules',
      icon: SlidersHorizontal,
      permission: 'alert_rule:write',
      keywords: ['aturan', 'rules', 'notifikasi', 'webhook', 'telegram'],
    },
  ],
});
