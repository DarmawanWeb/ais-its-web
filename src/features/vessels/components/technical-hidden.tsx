import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Placeholder of a technical value that only the owning organization sees (spec §8.5). */
export function TechnicalHidden() {
  const { t } = useTranslation('vessels');
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={t('list.technicalHidden')}
    >
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">{t('list.technicalHidden')}</span>
    </span>
  );
}
