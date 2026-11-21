import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Profile & security (reached from the user menu; no sidebar entry). */
export const feature = defineFeature({
  id: 'profile',
  i18n: { id, en },
  routes: [
    {
      path: 'profile',
      handle: { titleKey: 'profile:title' },
      lazy: lazyPage(() => import('./pages/profile-page'), 'ProfilePage'),
    },
  ],
});
