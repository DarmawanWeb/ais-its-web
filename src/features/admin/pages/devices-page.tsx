import { Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function DevicesPage() {
  const { t } = useTranslation('admin');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={Cpu}
      title={t('devices.title')}
      description={t('devices.description')}
      capabilities={t('devices.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
