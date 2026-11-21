import { format as formatDateFns, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { enUS, id as idLocale } from 'date-fns/locale';

/** BCP 47 tag used by Intl for an app language. */
export function intlLocale(language: string): string {
  return language === 'en' ? 'en-GB' : 'id-ID';
}

/** date-fns locale of an app language. */
export function dateFnsLocale(language: string) {
  return language === 'en' ? enUS : idLocale;
}

/** Formats a number with the conventions of the language (id: 1.234,5 · en: 1,234.5). */
export function formatNumber(
  value: number | null | undefined,
  language: string,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(intlLocale(language), {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

function toDate(value: Date | string | number): Date | null {
  const date = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

/** Formats an ISO-8601 timestamp or Date, e.g. "21 Nov 2026 14:05". */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  language: string,
  pattern = 'dd MMM yyyy HH:mm',
): string {
  if (value === null || value === undefined) return '—';
  const date = toDate(value);
  return date ? formatDateFns(date, pattern, { locale: dateFnsLocale(language) }) : '—';
}

/** Relative time, e.g. "5 menit yang lalu" / "5 minutes ago". */
export function formatRelativeTime(
  value: Date | string | number | null | undefined,
  language: string,
): string {
  if (value === null || value === undefined) return '—';
  const date = toDate(value);
  return date
    ? formatDistanceToNowStrict(date, { addSuffix: true, locale: dateFnsLocale(language) })
    : '—';
}

export type CoordinateFormat = 'decimal' | 'dms';

function toDms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  return `${degrees}°${String(minutes).padStart(2, '0')}′${seconds.toFixed(1).padStart(4, '0')}″ ${hemisphere}`;
}

/** Formats a coordinate pair: decimal "1.14324° N, 103.85641° E" or DMS. */
export function formatCoordinates(
  lat: number,
  lon: number,
  format: CoordinateFormat = 'decimal',
  precision = 5,
): string {
  if (format === 'dms') return `${toDms(lat, 'N', 'S')}, ${toDms(lon, 'E', 'W')}`;
  const latText = `${Math.abs(lat).toFixed(precision)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonText = `${Math.abs(lon).toFixed(precision)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latText}, ${lonText}`;
}
