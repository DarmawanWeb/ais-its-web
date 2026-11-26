import { Loader2, MapPin, Ship } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { positionsControllerVesselLatest } from '@/shared/api/generated/ais-processor/ais/ais';
import { useVesselsControllerList } from '@/shared/api/generated/fleet/vessels/vessels';
import { isApiProblem } from '@/shared/api/problem';
import { usePermission } from '@/shared/auth/hooks';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { realtime } from '@/shared/realtime/client';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/shared/ui/command';
import { toast } from '@/shared/ui/sonner';

import { useLiveMapStore } from '../hooks/use-live-map-store';
import { searchLiveVessels } from '../lib/vessel-filters';

/**
 * Vessel search of the live map: vessels already on the map (name or MMSI prefix) and the
 * fleet registry (`GET /vessels?search=`); choosing one selects it and flies there — for a
 * registry vessel off the map, to its latest AIS position (`GET /ais/vessels/:mmsi/latest`).
 */
export function MapSearch() {
  const { t } = useTranslation('map');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [locating, setLocating] = useState<number | null>(null);
  const debounced = useDebouncedValue(query.trim(), 250);
  const canSearchFleet = usePermission('vessel:read');
  const select = useLiveMapStore((state) => state.select);
  const requestFlyTo = useLiveMapStore((state) => state.requestFlyTo);

  const live =
    debounced.length >= 2 ? searchLiveVessels(realtime.vessels.snapshot(), debounced, 5) : [];
  const fleet = useVesselsControllerList(
    { search: debounced, pageSize: 6 },
    { query: { enabled: canSearchFleet && debounced.length >= 2, staleTime: 60_000 } },
  );
  const liveMmsis = new Set(live.map((record) => record.mmsi));
  const fleetMatches = (fleet.data?.data ?? []).filter((vessel) => !liveMmsis.has(vessel.mmsi));
  const open = focused && debounced.length >= 2;

  const choose = async (mmsi: number) => {
    setQuery('');
    select(mmsi);
    const known = realtime.vessels.get(mmsi);
    if (known) {
      requestFlyTo([known.lon, known.lat], 13);
      return;
    }
    setLocating(mmsi);
    try {
      const latest = await positionsControllerVesselLatest(String(mmsi));
      requestFlyTo([latest.lon, latest.lat], 13);
    } catch (error) {
      toast.warning(
        isApiProblem(error) && error.code === 'AIS_POSITION_NOT_FOUND'
          ? t('search.noPosition', { mmsi })
          : t('search.locateFailed'),
      );
    } finally {
      setLocating(null);
    }
  };

  return (
    <Command
      shouldFilter={false}
      label={t('search.label')}
      className="glass-panel h-auto overflow-visible rounded-xl border bg-transparent shadow-panel"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        data-testid="map-search"
        className="h-10"
      />
      {/* Always rendered: the input's aria-controls points at the list. */}
      <CommandList
        className={open ? 'max-h-72 border-t' : 'hidden'}
        aria-label={t('search.results')}
      >
        {open && (
          <>
            {live.length === 0 && fleetMatches.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground" role="status">
                {fleet.isFetching ? t('search.searching') : t('search.empty')}
              </p>
            ) : null}
            {live.length > 0 && (
              <CommandGroup heading={t('search.onMap')}>
                {live.map((record) => (
                  <CommandItem
                    key={record.mmsi}
                    value={`live-${record.mmsi}`}
                    onSelect={() => void choose(record.mmsi)}
                  >
                    <MapPin className="text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {record.vessel?.name ?? t('vessel.unknownName')}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{record.mmsi}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {fleetMatches.length > 0 && (
              <CommandGroup heading={t('search.fleet')}>
                {fleetMatches.map((vessel) => (
                  <CommandItem
                    key={vessel.id}
                    value={`fleet-${vessel.mmsi}`}
                    onSelect={() => void choose(vessel.mmsi)}
                  >
                    {locating === vessel.mmsi ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Ship aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{vessel.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{vessel.mmsi}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
