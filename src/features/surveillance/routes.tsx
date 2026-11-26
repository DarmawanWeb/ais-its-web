import { Activity, ArrowLeftRight, EyeOff, Fish, Radar } from 'lucide-react';
import { Navigate } from 'react-router';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Illegal activity surveillance (surveillance service, spec §13.8). */
export const feature = defineFeature({
  id: 'surveillance',
  i18n: { id, en },
  routes: [
    {
      // The overview's nav entry matches exactly (`end`), so it is not active on every
      // surveillance page.
      path: 'surveillance',
      handle: { titleKey: 'surveillance:overview.title', permission: 'surveillance:read' },
      lazy: lazyPage(() => import('./pages/overview-page'), 'OverviewPage'),
    },
    {
      // Earlier links (bookmarks) of the overview.
      path: 'surveillance/overview',
      handle: { titleKey: 'surveillance:overview.title', permission: 'surveillance:read' },
      element: <Navigate to="/surveillance" replace />,
    },
    {
      path: 'surveillance/transhipment',
      handle: { titleKey: 'surveillance:transhipment.title', permission: 'surveillance:read' },
      lazy: lazyPage(() => import('./pages/transhipment-page'), 'TranshipmentPage'),
    },
    {
      path: 'surveillance/transhipment/:eventId',
      handle: {
        titleKey: 'surveillance:transhipment.detailTitle',
        permission: 'surveillance:read',
      },
      lazy: lazyPage(() => import('./pages/transhipment-detail-page'), 'TranshipmentDetailPage'),
    },
    {
      path: 'surveillance/fishing',
      handle: { titleKey: 'surveillance:fishing.title', permission: 'surveillance:read' },
      lazy: lazyPage(() => import('./pages/fishing-page'), 'FishingPage'),
    },
    {
      path: 'surveillance/dark',
      handle: { titleKey: 'surveillance:dark.title', permission: 'surveillance:read' },
      lazy: lazyPage(() => import('./pages/dark-page'), 'DarkPage'),
    },
    {
      path: 'surveillance/anomaly',
      handle: { titleKey: 'surveillance:anomaly.title', permission: 'surveillance:read' },
      lazy: lazyPage(() => import('./pages/anomaly-page'), 'AnomalyPage'),
    },
  ],
  nav: [
    {
      id: 'surveillance.overview',
      section: 'surveillance',
      order: 5,
      path: '/surveillance',
      end: true,
      labelKey: 'surveillance:nav.overview',
      icon: Radar,
      permission: 'surveillance:read',
      keywords: ['pengawasan', 'surveillance', 'ringkasan', 'statistik', 'detektor'],
    },
    {
      id: 'surveillance.transhipment',
      section: 'surveillance',
      order: 10,
      path: '/surveillance/transhipment',
      labelKey: 'surveillance:nav.transhipment',
      icon: ArrowLeftRight,
      permission: 'surveillance:read',
      keywords: ['transhipment', 'sts', 'ship-to-ship', 'alih muat'],
    },
    {
      id: 'surveillance.fishing',
      section: 'surveillance',
      order: 20,
      path: '/surveillance/fishing',
      labelKey: 'surveillance:nav.fishing',
      icon: Fish,
      permission: 'surveillance:read',
      keywords: ['fishing', 'ikan', 'heatmap', 'loitering', 'iuu'],
    },
    {
      id: 'surveillance.dark',
      section: 'surveillance',
      order: 30,
      path: '/surveillance/dark',
      labelKey: 'surveillance:nav.dark',
      icon: EyeOff,
      permission: 'surveillance:read',
      keywords: ['dark', 'gap', 'ais', 'gelap', 'terputus'],
    },
    {
      id: 'surveillance.anomaly',
      section: 'surveillance',
      order: 40,
      path: '/surveillance/anomaly',
      labelKey: 'surveillance:nav.anomaly',
      icon: Activity,
      permission: 'surveillance:read',
      keywords: ['navstatus', 'anomali', 'anomaly', 'status navigasi'],
    },
  ],
});
