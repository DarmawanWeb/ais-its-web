import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type CoordinateFormat, formatCoordinates, formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return [copied, copy];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, copy] = useCopy();
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        copy(text);
      }}
      aria-label={label}
      title={label}
      className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/copy:opacity-100 hover:text-foreground focus-visible:opacity-100"
    >
      <Icon className="size-3" />
    </button>
  );
}

/** A vessel MMSI in the monospace font, optionally copyable. */
export function MmsiText({
  mmsi,
  copyable = false,
  className,
}: {
  mmsi: number | string | null | undefined;
  copyable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (mmsi === null || mmsi === undefined || mmsi === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  const text = String(mmsi);
  return (
    <span className={cn('group/copy inline-flex items-center gap-1', className)}>
      <span className="font-mono text-[0.92em] tracking-tight tabular-nums">{text}</span>
      {copyable && <CopyButton text={text} label={t('domain.copyMmsi')} />}
    </span>
  );
}

/** Latitude/longitude in the monospace font, optionally copyable ("lat, lon" decimal). */
export function CoordinateText({
  lat,
  lon,
  format = 'decimal',
  precision = 5,
  copyable = false,
  className,
}: {
  lat: number | null | undefined;
  lon: number | null | undefined;
  format?: CoordinateFormat;
  precision?: number;
  copyable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={cn('group/copy inline-flex items-center gap-1', className)}>
      <span className="font-mono text-[0.92em] tracking-tight tabular-nums">
        {formatCoordinates(lat, lon, format, precision)}
      </span>
      {copyable && (
        <CopyButton
          text={`${lat.toFixed(6)}, ${lon.toFixed(6)}`}
          label={t('domain.copyCoordinates')}
        />
      )}
    </span>
  );
}

/** Units understood by {@link UnitValue} (spec §5 unit suffixes). */
export type Unit =
  'knots' | 'nm' | 'tonnes' | 'kw' | 'm' | 'km' | 'minutes' | 'percent' | 'deg' | 'gkwh';

const DEFAULT_DIGITS: Record<Unit, number> = {
  knots: 1,
  nm: 2,
  tonnes: 2,
  kw: 0,
  m: 0,
  km: 2,
  minutes: 0,
  percent: 1,
  deg: 0,
  gkwh: 1,
};

/** Formats a value with its unit using the UI language (id: 1.234,5 kn · en: 1,234.5 kn). */
export function UnitValue({
  value,
  unit,
  digits,
  className,
  unitClassName,
}: {
  value: number | null | undefined;
  unit: Unit;
  digits?: number;
  className?: string;
  unitClassName?: string;
}) {
  const { t, i18n } = useTranslation();
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const fractionDigits = digits ?? DEFAULT_DIGITS[unit];
  const text = formatNumber(value, i18n.language, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const symbol = t(`domain.units.${unit}`);
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {text}
      <span
        className={cn(
          'font-sans text-[0.85em] text-muted-foreground',
          unit === 'deg' || unit === 'percent' ? '' : 'ml-0.5',
          unitClassName,
        )}
      >
        {unit === 'deg' || unit === 'percent' ? symbol : `\u00a0${symbol}`}
      </span>
    </span>
  );
}
