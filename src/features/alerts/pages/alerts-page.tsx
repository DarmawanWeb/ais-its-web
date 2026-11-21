import { BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function AlertsPage() {
  const { t } = useTranslation('alerts');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.operations')}
      icon={BellRing}
      title={t('alerts.title')}
      description={t('alerts.description')}
      capabilities={t('alerts.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
