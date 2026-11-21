import { Ship } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function ListPage() {
  const { t } = useTranslation('vessels');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.fleet')}
      icon={Ship}
      title={t('list.title')}
      description={t('list.description')}
      capabilities={t('list.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
