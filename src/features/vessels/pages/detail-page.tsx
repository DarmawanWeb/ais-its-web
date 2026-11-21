import { Ship } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { PlaceholderPage } from '@/shared/domain-ui/placeholder-page';
import { MmsiText } from '@/shared/domain-ui/values';

/** Placeholder — replace with the real page (see docs/FEATURE_GUIDE.md). */
export function DetailPage() {
  const { t } = useTranslation('vessels');
  const { mmsi } = useParams<{ mmsi: string }>();
  return (
    <PlaceholderPage
      eyebrow={<MmsiText mmsi={mmsi} />}
      icon={Ship}
      title={t('detail.title')}
      description={t('detail.description')}
      capabilities={t('detail.capabilities', { returnObjects: true }) as string[]}
    />
  );
}
