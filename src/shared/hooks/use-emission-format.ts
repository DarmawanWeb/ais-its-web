import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';

/**
 * Formatters of emission figures in the UI language (CII, SEEMP, dashboard): CII with two
 * decimals, ratings with three, Z and percentages without a space before `%`, US dollars.
 */
export function useEmissionFormat() {
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
      /** Attained / required CII, g CO2 / (capacity · nm). */
      cii: (value: number | null | undefined) => fixed(value, 2),
      /** Rating attained / required (dimensionless). */
      rating: (value: number | null | undefined) => fixed(value, 3),
      /** Plain number with up to `digits` decimals. */
      number: (value: number | null | undefined, digits = 0) =>
        formatNumber(value, language, { maximumFractionDigits: digits }),
      fixed,
      percent: (value: number | null | undefined, digits = 1) =>
        value === null || value === undefined ? '—' : `${fixed(value, digits)}%`,
      /** Reduction factor Z: up to three decimals, trailing zeros trimmed (5%, 13,625%). */
      z: (value: number | null | undefined) =>
        value === null || value === undefined
          ? '—'
          : `${formatNumber(value, language, { maximumFractionDigits: 3 })}%`,
      signedPercent: (value: number, digits = 1) =>
        `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fixed(Math.abs(value), digits)}%`,
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
      date: (value: string | null | undefined) => formatDateTime(value, language, 'dd MMM yyyy'),
      dayMonth: (value: string | null | undefined) => formatDateTime(value, language, 'dd MMM'),
      dateTime: (value: string | null | undefined) => formatDateTime(value, language),
      time: (value: string | null | undefined) => formatDateTime(value, language, 'HH:mm'),
      relative: (value: string | Date | null | undefined) => formatRelativeTime(value, language),
    };
  }, [language]);
}
