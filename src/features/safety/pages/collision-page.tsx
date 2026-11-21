import { Radar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function CollisionPage() {
  const { t } = useTranslation('safety');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.safety')}
      icon={Radar}
      title={t('collision.title')}
      description={t('collision.description')}
      capabilities={t('collision.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
