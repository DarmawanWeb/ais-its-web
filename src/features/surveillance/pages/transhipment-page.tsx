import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function TranshipmentPage() {
  const { t } = useTranslation('surveillance');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.surveillance')}
      icon={ArrowLeftRight}
      title={t('transhipment.title')}
      description={t('transhipment.description')}
      capabilities={t('transhipment.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
