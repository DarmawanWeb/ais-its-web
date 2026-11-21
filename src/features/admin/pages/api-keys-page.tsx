import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function ApikeysPage() {
  const { t } = useTranslation('admin');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={KeyRound}
      title={t('apiKeys.title')}
      description={t('apiKeys.description')}
      capabilities={t('apiKeys.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
