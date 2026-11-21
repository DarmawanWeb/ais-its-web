import { Fuel } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function TelemetryPage() {
  const { t } = useTranslation('telemetry');
  return (
    <PlaceholderPage
      eyebrow={t('common:nav.sections.fleet')}
      icon={Fuel}
      title={t('telemetry.title')}
      description={t('telemetry.description')}
      capabilities={t('telemetry.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
