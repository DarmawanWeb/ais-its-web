import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getVesselsControllerGetByMmsiQueryOptions } from '@/shared/api/generated/fleet/vessels/vessels';
import { realtime } from '@/shared/realtime';

/** At most this many registry look-ups per list (a page shows 15–20 rows, two vessels each). */
export const MAX_NAME_LOOKUPS = 60;

/**
 * MMSIs whose name is not known yet, deduplicated and capped: the look-ups of a list page.
 * `isKnown` tells whether a name is already available without a request.
 */
export function missingNames(
  mmsis: readonly number[],
  isKnown: (mmsi: number) => boolean,
  max = MAX_NAME_LOOKUPS,
): number[] {
  const missing: number[] = [];
  for (const mmsi of new Set(mmsis)) {
    if (isKnown(mmsi)) continue;
    missing.push(mmsi);
    if (missing.length >= max) break;
  }
  return missing.sort((a, b) => a - b);
}

/**
 * Vessel names for lists whose rows carry only MMSIs (safety events, collision encounters):
 * names the page already has (`known`, e.g. the safety states' identity) and the live store of
 * this tab first, then the fleet registry (`GET /vessels/by-mmsi/:mmsi`; vessel identity is
 * shared across tenants, spec §8.5), cached for 30 minutes. Vessels outside the registry (404)
 * stay unnamed and show their MMSI.
 */
export function useVesselNames(
  mmsis: readonly number[],
  known: ReadonlyMap<number, string>,
): ReadonlyMap<number, string> {
  const missing = useMemo(
    () => missingNames(mmsis, (mmsi) => known.has(mmsi) || !!liveName(mmsi)),
    [mmsis, known],
  );
  const looked = useQueries({
    queries: missing.map((mmsi) => ({
      ...getVesselsControllerGetByMmsiQueryOptions(String(mmsi)),
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
      retry: false,
    })),
    combine: (results) => results.map((result) => result.data?.name ?? null).join('\u0000'),
  });
  return useMemo(() => {
    const names = new Map(known);
    for (const mmsi of mmsis) {
      if (names.has(mmsi)) continue;
      const name = liveName(mmsi);
      if (name) names.set(mmsi, name);
    }
    const found = looked.split('\u0000');
    missing.forEach((mmsi, index) => {
      const name = found[index];
      if (name) names.set(mmsi, name);
    });
    return names;
  }, [known, mmsis, missing, looked]);
}

function liveName(mmsi: number): string | null {
  return realtime.vessels.get(mmsi)?.vessel?.name ?? null;
}
