import { Cable } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function EwsPage() {
  const { t } = useTranslation('safety');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.safety')}
      icon={Cable}
      title={t('ews.title')}
      description={t('ews.description')}
      capabilities={t('ews.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
