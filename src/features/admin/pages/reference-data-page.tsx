import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function ReferencedataPage() {
  const { t } = useTranslation('admin');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={Database}
      title={t('referenceData.title')}
      description={t('referenceData.description')}
      capabilities={t('referenceData.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
