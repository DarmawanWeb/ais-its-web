import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateTime, formatNumber } from '@/shared/lib/format';

/** Number, money and date formatters of the SEEMP pages in the UI language. */
export function useSeempFormat() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const fixed = (value: number | null | undefined, digits: number) =>
      formatNumber(value, language, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    const usd = (value: number | null | undefined) =>
      formatNumber(value, language, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });
    return {
      language,
      cii: (value: number | null | undefined) => fixed(value, 2),
      rating: (value: number | null | undefined) => fixed(value, 3),
      number: (value: number | null | undefined, digits = 0) =>
        formatNumber(value, language, { maximumFractionDigits: digits }),
      fixed,
      percent: (value: number | null | undefined, digits = 1) =>
        value === null || value === undefined ? '—' : `${fixed(value, digits)}%`,
      usd,
      /** Compact money, e.g. "US$ 1,3 jt" / "$1.3M". */
      usdCompact: (value: number | null | undefined) =>
        formatNumber(value, language, {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1,
        }),
      usdRange: (low: number, high: number) =>
        low === high ? usd(low) : `${usd(low)} – ${usd(high)}`,
      dateTime: (value: string | null | undefined) => formatDateTime(value, language),
      date: (value: string | null | undefined) => formatDateTime(value, language, 'dd MMM yyyy'),
    };
  }, [language]);
}
