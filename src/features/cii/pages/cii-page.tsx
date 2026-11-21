import { Leaf } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function CiiPage() {
  const { t } = useTranslation('cii');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.fleet')}
      icon={Leaf}
      title={t('cii.title')}
      description={t('cii.description')}
      capabilities={t('cii.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
