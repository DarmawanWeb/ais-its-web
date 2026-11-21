import { LayoutDashboard } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Fleet dashboard (landing page after sign-in, HOME_PATH). */
export const feature = defineFeature({
  id: 'dashboard',
  i18n: { id, en },
  routes: [
    {
      path: 'dashboard',
      handle: { titleKey: 'dashboard:title', permission: 'vessel:read' },
      lazy: lazyPage(() => import('./pages/dashboard-page'), 'DashboardPage'),
    },
  ],
  nav: [
    {
      id: 'dashboard.dashboard',
      section: 'fleet',
      order: 10,
      path: '/dashboard',
      labelKey: 'dashboard:nav.dashboard',
      icon: LayoutDashboard,
      permission: 'vessel:read',
      keywords: ['dashboard', 'beranda', 'home', 'ringkasan'],
    },
  ],
});
