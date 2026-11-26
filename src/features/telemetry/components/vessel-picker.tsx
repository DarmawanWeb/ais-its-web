import { Search, Ship } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TelemetryVesselDto } from '@/shared/api/generated/telemetry/model';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';

/** Vessels of the organization with their telemetry state; picks the explored vessel. */
export function VesselPicker({
  vessels,
  loading,
  selected,
  onSelect,
}: {
  vessels: readonly TelemetryVesselDto[];
  loading: boolean;
  selected: number | null;
  onSelect: (mmsi: number) => void;
}) {
  const { t, i18n } = useTranslation('telemetry');
  const [term, setTerm] = useState('');
  const query = term.trim().toLowerCase();
  const shown = vessels.filter(
    (vessel) =>
      !query || vessel.name.toLowerCase().includes(query) || String(vessel.mmsi).startsWith(query),
  );
  const active = vessels.filter((vessel) => vessel.active).length;
  return (
    <section
      aria-labelledby="telemetry-vessels-title"
      className="flex min-h-0 flex-col rounded-xl border bg-surface shadow-xs"
    >
      <div className="space-y-3 border-b p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="telemetry-vessels-title" className="text-sm font-semibold">
            {t('vessels.title')}
          </h2>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              {t('vessels.activeCount', { active, total: vessels.length })}
            </span>
          )}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('vessels.search')}
            aria-label={t('vessels.search')}
            className="h-8 pl-8"
          />
        </div>
      </div>
      {loading ? (
        <div className="grid gap-2 p-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Ship}
          size="sm"
          title={vessels.length ? t('vessels.noMatch') : t('vessels.empty')}
          description={vessels.length ? undefined : t('vessels.emptyHint')}
        />
      ) : (
        <ul
          className="grid max-h-[28rem] grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto p-2"
          aria-label={t('vessels.title')}
        >
          {shown.map((vessel) => (
            <li key={vessel.mmsi}>
              <button
                type="button"
                aria-pressed={vessel.mmsi === selected}
                onClick={() => onSelect(vessel.mmsi)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  vessel.mmsi === selected
                    ? 'bg-primary/12 text-foreground ring-1 ring-primary/40'
                    : 'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    vessel.active ? 'bg-success' : 'bg-muted-foreground/60',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{vessel.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">{vessel.mmsi}</span> ·{' '}
                    {vessel.lastReadingAt
                      ? formatRelativeTime(vessel.lastReadingAt, i18n.language)
                      : t('vessels.noReading')}
                  </span>
                </span>
                <span className="sr-only">
                  {vessel.active ? t('status.active') : t('status.inactive')}
                </span>
                <span
                  className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  title={t('vessels.devices', { count: vessel.devices })}
                >
                  {t('vessels.devicesShort', { count: vessel.devices })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
