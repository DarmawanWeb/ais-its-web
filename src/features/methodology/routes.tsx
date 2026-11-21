import { BookOpenText } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Methodology & references (spec §17); visible to every signed-in user. */
export const feature = defineFeature({
  id: 'methodology',
  i18n: { id, en },
  routes: [
    {
      path: 'methodology',
      handle: { titleKey: 'methodology:title' },
      lazy: lazyPage(() => import('./pages/methodology-page'), 'MethodologyPage'),
    },
  ],
  nav: [
    {
      id: 'methodology.methodology',
      section: 'knowledge',
      order: 10,
      path: '/methodology',
      labelKey: 'methodology:nav.methodology',
      icon: BookOpenText,
      keywords: ['metodologi', 'rumus', 'formula', 'referensi', 'sumber', 'katex'],
    },
  ],
});
