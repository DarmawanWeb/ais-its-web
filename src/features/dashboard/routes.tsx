import { LayoutDashboard } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/**
 * Operations overview, the landing page after sign-in (HOME_PATH `/dashboard`; `/` redirects
 * there). Every role holds `vessel:read`; each card checks its own permission.
 */
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
      keywords: ['dashboard', 'beranda', 'home', 'ringkasan', 'overview', 'kpi'],
    },
  ],
});
