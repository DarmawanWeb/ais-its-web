import type { VesselDetailDto, VesselSummaryDto } from '@/shared/api/generated/fleet/model';

export type AnyVessel = VesselDetailDto | VesselSummaryDto;

/** Technical data is present (the vessel belongs to the reader's organization, spec §8.5). */
export function isDetailView(vessel: AnyVessel | null | undefined): vessel is VesselDetailDto {
  return vessel?.view === 'detail';
}

/** Country name of an ISO 3166-1 alpha-2 flag code in the UI language ("Indonesia"). */
export function flagName(code: string | null | undefined, language: string): string | null {
  if (!code) return null;
  try {
    const names = new Intl.DisplayNames([language === 'en' ? 'en' : 'id'], { type: 'region' });
    const name = names.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

/** Freshness of an AIS position: live (≤ 10 min), recent (≤ 6 h), stale, or never seen. */
export type PositionFreshness = 'live' | 'recent' | 'stale' | 'none';

export function positionFreshness(time: string | null | undefined, now: number): PositionFreshness {
  if (!time) return 'none';
  const age = now - Date.parse(time);
  if (Number.isNaN(age)) return 'none';
  if (age <= 10 * 60_000) return 'live';
  if (age <= 6 * 3_600_000) return 'recent';
  return 'stale';
}

/** `/map` deep link that selects the vessel (and shows its track panel). */
export function mapLinkOf(mmsi: number, position?: { lat: number; lon: number } | null): string {
  const params = new URLSearchParams({ vessel: String(mmsi) });
  if (position) {
    params.set('lat', position.lat.toFixed(5));
    params.set('lon', position.lon.toFixed(5));
    params.set('z', '11');
  }
  return `/map?${params.toString()}`;
}

/** Valid 9-digit MMSI of a route parameter, else null. */
export function parseMmsiParam(value: string | undefined): number | null {
  return value && /^\d{9}$/.test(value) && Number(value) >= 100_000_000 ? Number(value) : null;
}
