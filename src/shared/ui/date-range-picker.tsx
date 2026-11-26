import { endOfDay, startOfDay, startOfYear, subDays, subHours } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';

import { dateFnsLocale, formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type { DateRange };

export type DateRangePreset = 'last24h' | 'last7d' | 'last30d' | 'thisYear';

export function presetRange(preset: DateRangePreset, now = new Date()): DateRange {
  switch (preset) {
    case 'last24h':
      return { from: subHours(now, 24), to: now };
    case 'last7d':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'last30d':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'thisYear':
      return { from: startOfYear(now), to: endOfDay(now) };
  }
}

/** Converts a range to the `from` / `to` ISO-8601 query parameters of the API (spec §5). */
export function toIsoRange(range: DateRange | undefined): { from?: string; to?: string } {
  return {
    ...(range?.from ? { from: range.from.toISOString() } : {}),
    ...(range?.to ? { to: range.to.toISOString() } : {}),
  };
}

export interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  presets?: readonly DateRangePreset[];
  className?: string;
  disabled?: boolean;
  /**
   * What the range filters ("Waktu kejadian"). It prefixes the trigger's accessible name as
   * visually hidden text, so the name still contains the visible range (WCAG 2.5.3).
   */
  label?: string;
}

export function DateRangePicker({
  value,
  onChange,
  presets = ['last24h', 'last7d', 'last30d', 'thisYear'],
  className,
  disabled,
  label,
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const text =
    value?.from && value.to
      ? `${formatDateTime(value.from, i18n.language, 'dd MMM yyyy')} – ${formatDateTime(value.to, i18n.language, 'dd MMM yyyy')}`
      : value?.from
        ? formatDateTime(value.from, i18n.language, 'dd MMM yyyy')
        : t('dateRange.placeholder');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start gap-2 text-left font-normal',
            !value?.from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4" aria-hidden />
          {label && <span className="sr-only">{label}: </span>}
          <span className="truncate tabular-nums">{text}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          {presets.length > 0 && (
            <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:border-r sm:border-b-0">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    onChange(presetRange(preset));
                    setOpen(false);
                  }}
                >
                  {t(`dateRange.${preset}`)}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={value}
            onSelect={onChange}
            defaultMonth={value?.from}
            locale={dateFnsLocale(i18n.language)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
