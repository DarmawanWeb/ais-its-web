import { ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function SeempPage() {
  const { t } = useTranslation('seemp');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.fleet')}
      icon={ClipboardCheck}
      title={t('seemp.title')}
      description={t('seemp.description')}
      capabilities={t('seemp.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
