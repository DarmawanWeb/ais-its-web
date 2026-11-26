import { isValidMmsi } from '@darmawanweb/ais-its-contracts/domain';
import { Check, Globe2, Plus, Ship, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MmsiText } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Spinner } from '@/shared/ui/spinner';

import { useVesselName, useVesselSearch, useZoneOptions } from '../api/rules-api';

function SelectedVessel({ mmsi, onRemove }: { mmsi: number; onRemove: () => void }) {
  const { t } = useTranslation('alert-rules');
  const name = useVesselName(mmsi);
  return (
    <Badge variant="secondary" className="gap-1.5 py-1 pr-1">
      <Ship aria-hidden />
      <span className="max-w-44 truncate">{name ?? t('editor.vessels.unknown')}</span>
      <MmsiText mmsi={mmsi} className="text-[11px] opacity-80" />
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 cursor-pointer rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={t('editor.vessels.remove', { name: name ?? mmsi })}
      >
        <X className="size-3" aria-hidden />
      </button>
    </Badge>
  );
}

/** Vessel filter: search the fleet (or every vessel for rules watching all vessels). */
export function VesselFilterField({
  value,
  onChange,
  orgId,
}: {
  value: readonly number[];
  onChange: (value: number[]) => void;
  /** Limit the search to the fleet of this organization (rules of scope `org`). */
  orgId?: string;
}) {
  const { t } = useTranslation('alert-rules');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 250);
  const results = useVesselSearch(term, orgId, open);
  const digits = search.replace(/\D/g, '');
  const typedMmsi = digits.length === 9 && isValidMmsi(Number(digits)) ? Number(digits) : null;

  const add = (mmsi: number) => {
    if (!value.includes(mmsi)) onChange([...value, mmsi]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && (
          <span className="text-sm text-muted-foreground">{t('editor.vessels.none')}</span>
        )}
        {value.map((mmsi) => (
          <SelectedVessel
            key={mmsi}
            mmsi={mmsi}
            onRemove={() => onChange(value.filter((m) => m !== mmsi))}
          />
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus /> {t('editor.vessels.add')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t('editor.vessels.searchPlaceholder')}
              aria-label={t('editor.vessels.search')}
            />
            <CommandList>
              {results.isFetching && !results.data ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Spinner /> {t('common:status.loading')}
                </div>
              ) : (
                <CommandEmpty>{t('editor.vessels.noResults')}</CommandEmpty>
              )}
              {typedMmsi !== null && !value.includes(typedMmsi) && (
                <CommandGroup>
                  <CommandItem value={`mmsi-${typedMmsi}`} onSelect={() => add(typedMmsi)}>
                    <Plus /> {t('editor.vessels.addMmsi', { mmsi: typedMmsi })}
                  </CommandItem>
                </CommandGroup>
              )}
              {(results.data?.data.length ?? 0) > 0 && (
                <CommandGroup heading={t('editor.vessels.results')}>
                  {results.data?.data.map((vessel) => {
                    const selected = value.includes(vessel.mmsi);
                    return (
                      <CommandItem
                        key={vessel.id}
                        value={vessel.id}
                        onSelect={() =>
                          selected
                            ? onChange(value.filter((m) => m !== vessel.mmsi))
                            : add(vessel.mmsi)
                        }
                      >
                        <Ship className="text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{vessel.name}</span>
                        <MmsiText mmsi={vessel.mmsi} className="text-xs text-muted-foreground" />
                        {selected && <Check className="text-primary" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Zone filter: alerts located in one of the chosen zones (geofence, EWS pipeline, …). */
export function ZoneFilterField({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation('alert-rules');
  const [open, setOpen] = useState(false);
  const zones = useZoneOptions();
  const list = zones.data?.data ?? [];
  const names = new Map(list.map((zone) => [zone.id, zone.name]));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((z) => z !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && (
          <span className="text-sm text-muted-foreground">{t('editor.zones.none')}</span>
        )}
        {value.map((id) => (
          <Badge key={id} variant="secondary" className="gap-1.5 py-1 pr-1">
            <Globe2 aria-hidden />
            <span className="max-w-48 truncate">{names.get(id) ?? id.slice(0, 8)}</span>
            <button
              type="button"
              onClick={() => toggle(id)}
              className="ml-0.5 cursor-pointer rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={t('editor.zones.remove', { name: names.get(id) ?? id })}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus /> {t('editor.zones.add')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('editor.zones.searchPlaceholder')}
              aria-label={t('editor.zones.search')}
            />
            <CommandList>
              <CommandEmpty>
                {zones.isPending ? t('common:status.loading') : t('editor.zones.noResults')}
              </CommandEmpty>
              <CommandGroup>
                {list.map((zone) => (
                  <CommandItem
                    key={zone.id}
                    value={`${zone.name} ${zone.code}`}
                    onSelect={() => toggle(zone.id)}
                  >
                    <Globe2 className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{zone.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{zone.code}</span>
                    {value.includes(zone.id) && <Check className="text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
