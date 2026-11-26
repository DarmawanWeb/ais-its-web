import { BellRing } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import { AlertsBell } from './components/alerts-bell';
import en from './i18n/en.json';
import id from './i18n/id.json';

/** Alert inbox and the top bar bell (notification service, spec §13.9). */
export const feature = defineFeature({
  id: 'alerts',
  i18n: { id, en },
  routes: [
    {
      path: 'alerts',
      handle: { titleKey: 'alerts:alerts.title', permission: 'alert:read' },
      lazy: lazyPage(() => import('./pages/alerts-page'), 'AlertsPage'),
    },
  ],
  nav: [
    {
      id: 'alerts.alerts',
      section: 'operations',
      order: 20,
      path: '/alerts',
      labelKey: 'alerts:nav.alerts',
      icon: BellRing,
      permission: 'alert:read',
      keywords: ['alert', 'notifikasi', 'inbox', 'peringatan', 'notification'],
    },
  ],
  commands: [
    {
      id: 'alerts.open-critical',
      labelKey: 'alerts:commands.openCritical',
      icon: BellRing,
      permission: 'alert:read',
      keywords: ['kritis', 'critical', 'alert'],
      perform: ({ navigate }) => void navigate('/alerts?severity=critical'),
    },
  ],
  slots: { 'topbar.alerts': AlertsBell },
});
