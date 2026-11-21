import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function AnomalyPage() {
  const { t } = useTranslation('surveillance');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.surveillance')}
      icon={Activity}
      title={t('anomaly.title')}
      description={t('anomaly.description')}
      capabilities={t('anomaly.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
