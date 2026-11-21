import { Hexagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function ZonesPage() {
  const { t } = useTranslation('zones');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={Hexagon}
      title={t('zones.title')}
      description={t('zones.description')}
      capabilities={t('zones.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
