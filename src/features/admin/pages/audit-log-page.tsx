import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function AuditlogPage() {
  const { t } = useTranslation('admin');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={ScrollText}
      title={t('auditLog.title')}
      description={t('auditLog.description')}
      capabilities={t('auditLog.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
