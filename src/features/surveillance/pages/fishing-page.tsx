import { Fish } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function FishingPage() {
  const { t } = useTranslation('surveillance');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.surveillance')}
      icon={Fish}
      title={t('fishing.title')}
      description={t('fishing.description')}
      capabilities={t('fishing.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
