import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function DarkPage() {
  const { t } = useTranslation('surveillance');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.surveillance')}
      icon={EyeOff}
      title={t('dark.title')}
      description={t('dark.description')}
      capabilities={t('dark.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
