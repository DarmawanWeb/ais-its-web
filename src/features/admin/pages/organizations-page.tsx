import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function OrganizationsPage() {
  const { t } = useTranslation('admin');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.settings')}
      icon={Building2}
      title={t('organizations.title')}
      description={t('organizations.description')}
      capabilities={t('organizations.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
