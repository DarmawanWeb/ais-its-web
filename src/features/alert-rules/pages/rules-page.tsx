import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function RulesPage() {
  const { t } = useTranslation('alert-rules');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={SlidersHorizontal}
      title={t('rules.title')}
      description={t('rules.description')}
      capabilities={t('rules.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
