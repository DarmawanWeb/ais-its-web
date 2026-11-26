import {
  ALERT_SEVERITY_LABELS,
  SURVEILLANCE_EVENT_STATUS_LABELS,
} from '@darmawanweb/ais-its-contracts/domain';
import { RotateCcw, Search } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import {
  activeFilterCount,
  EVENT_STATUSES,
  type EventFilters,
  parseMmsi,
  RANGE_PRESETS,
  type RangePreset,
  SEVERITIES,
} from '../lib/filters';

const ALL = 'all';

/**
 * Filters of the surveillance lists: time range, severity, review status and vessel (MMSI,
 * matches both vessels of a pair). `children` adds page-specific controls.
 */
export function FiltersBar({
  filters,
  onChange,
  onReset,
  showStatus = true,
  showSeverity = true,
  children,
}: {
  filters: EventFilters;
  onChange: (patch: Partial<EventFilters>) => void;
  onReset: () => void;
  showStatus?: boolean;
  showSeverity?: boolean;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const id = useId();
  const count = activeFilterCount(filters);

  return (
    <div
      role="search"
      aria-label={t('filters.label')}
      className="flex flex-col gap-3 rounded-xl border bg-surface p-3 shadow-xs lg:flex-row lg:flex-wrap lg:items-end"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id={`${id}-range`} className="text-xs font-medium text-muted-foreground">
          {t('filters.range')}
        </span>
        <ToggleGroup
          type="single"
          aria-labelledby={`${id}-range`}
          value={filters.range}
          onValueChange={(value) => value && onChange({ range: value as RangePreset })}
          className="w-full sm:w-auto"
        >
          {RANGE_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset} value={preset} className="h-7 flex-1 px-3 sm:flex-none">
              {t(`filters.ranges.${preset}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        {showSeverity && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-severity`} className="text-xs text-muted-foreground">
              {t('filters.severity')}
            </Label>
            <Select
              value={filters.severity ?? ALL}
              onValueChange={(value) =>
                onChange({ severity: value === ALL ? null : (value as EventFilters['severity']) })
              }
            >
              <SelectTrigger id={`${id}-severity`} size="sm" className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
                {SEVERITIES.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {ALERT_SEVERITY_LABELS[severity][locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showStatus && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
              {t('filters.status')}
            </Label>
            <Select
              value={filters.status ?? ALL}
              onValueChange={(value) =>
                onChange({ status: value === ALL ? null : (value as EventFilters['status']) })
              }
            >
              <SelectTrigger id={`${id}-status`} size="sm" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
                {EVENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {SURVEILLANCE_EVENT_STATUS_LABELS[status][locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <MmsiFilter
          key={String(filters.mmsi)}
          mmsi={filters.mmsi}
          onChange={(mmsi) => onChange({ mmsi })}
        />
        {children}
      </div>

      {count > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="self-start lg:ml-auto lg:self-end"
        >
          <RotateCcw /> {t('filters.reset', { count })}
        </Button>
      )}
    </div>
  );
}

/** MMSI search (applied on Enter or blur; remounted when the URL filter changes). */
function MmsiFilter({
  mmsi,
  onChange,
}: {
  mmsi: number | null;
  onChange: (mmsi: number | null) => void;
}) {
  const { t } = useTranslation('surveillance');
  const id = useId();
  const [mmsiText, setMmsiText] = useState(mmsi === null ? '' : String(mmsi));
  const [mmsiError, setMmsiError] = useState(false);
  const applyMmsi = () => {
    const parsed = parseMmsi(mmsiText);
    if (parsed === undefined) {
      setMmsiError(true);
      return;
    }
    setMmsiError(false);
    if (parsed !== mmsi) onChange(parsed);
  };
  return (
    <form
      className="col-span-2 flex min-w-0 flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        applyMmsi();
      }}
    >
      <Label htmlFor={`${id}-mmsi`} className="text-xs text-muted-foreground">
        {t('filters.mmsi')}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={`${id}-mmsi`}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('filters.mmsiPlaceholder')}
          value={mmsiText}
          onChange={(event) => setMmsiText(event.target.value)}
          onBlur={applyMmsi}
          aria-invalid={mmsiError || undefined}
          aria-describedby={mmsiError ? `${id}-mmsi-error` : undefined}
          className="h-8 w-full pl-8 font-mono sm:w-44"
        />
      </div>
      {mmsiError && (
        <p id={`${id}-mmsi-error`} className="text-xs text-danger">
          {t('filters.mmsiInvalid')}
        </p>
      )}
    </form>
  );
}
