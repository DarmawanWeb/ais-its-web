import { useTranslation } from 'react-i18next';

/** Localized measure name and description (falls back to the legacy text of the API). */
export function useMeasureText() {
  const { t } = useTranslation('seemp');
  return (code: string, fallback?: string) => ({
    name: t(`measureNames.${code}.name`, { defaultValue: fallback ?? code }),
    description: t(`measureNames.${code}.description`, { defaultValue: '' }),
  });
}
