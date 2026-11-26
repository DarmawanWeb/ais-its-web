import type { AisSource } from '@darmawanweb/ais-its-contracts/domain';

import { vesselIconName, type VesselIconName } from '@/shared/map/vessel-icons';
import { safetyRingKind } from '@/shared/map/vessel-layer';
import type { VesselLiveRecord } from '@/shared/realtime/vessel-store';
import type { SafetyRingKind } from '@/shared/theme/tokens';

/** Safety class of a vessel: its ring kind (EWS before collision) or normal. */
export type SafetyClass = SafetyRingKind | 'normal';

export const SAFETY_CLASSES: readonly SafetyClass[] = [
  'ewsDanger',
  'ewsWarning',
  'collisionHigh',
  'collisionMedium',
  'normal',
];

export function safetyClass(record: Pick<VesselLiveRecord, 'safety'>): SafetyClass {
  return safetyRingKind(record) ?? 'normal';
}

/** Ship type category of a record (the icon of its fleet type code). */
export function vesselCategory(record: Pick<VesselLiveRecord, 'vessel'>): VesselIconName {
  return vesselIconName(record.vessel?.typeCode);
}

/** Filters of the live map; `null` = no restriction. */
export interface VesselFilters {
  categories: ReadonlySet<VesselIconName> | null;
  navstatus: ReadonlySet<number> | null;
  safety: ReadonlySet<SafetyClass> | null;
  sources: ReadonlySet<AisSource> | null;
}

export const NO_FILTERS: VesselFilters = {
  categories: null,
  navstatus: null,
  safety: null,
  sources: null,
};

export function hasFilters(filters: VesselFilters): boolean {
  return filters.categories !== null || filters.navstatus !== null || filters.safety !== null;
}

/** The records the filters let through (stable order). */
export function filterVessels(
  records: readonly VesselLiveRecord[],
  filters: VesselFilters,
): readonly VesselLiveRecord[] {
  const { categories, navstatus, safety, sources } = filters;
  if (!categories && !navstatus && !safety && !sources) return records;
  return records.filter((record) => {
    if (sources) {
      const source = record.position?.source;
      if (source && !sources.has(source)) return false;
    }
    if (categories && !categories.has(vesselCategory(record))) return false;
    if (navstatus) {
      const code = record.position?.navstatus;
      if (code === undefined || !navstatus.has(code)) return false;
    }
    if (safety && !safety.has(safetyClass(record))) return false;
    return true;
  });
}

export interface VesselStats {
  total: number;
  ewsDanger: number;
  ewsWarning: number;
  collisionHigh: number;
  collisionMedium: number;
}

export const EMPTY_STATS: VesselStats = {
  total: 0,
  ewsDanger: 0,
  ewsWarning: 0,
  collisionHigh: 0,
  collisionMedium: 0,
};

export function vesselStats(records: readonly VesselLiveRecord[]): VesselStats {
  const stats = { ...EMPTY_STATS, total: records.length };
  for (const record of records) {
    const kind = safetyRingKind(record);
    if (kind) stats[kind] += 1;
  }
  return stats;
}

export function sameStats(a: VesselStats, b: VesselStats): boolean {
  return (
    a.total === b.total &&
    a.ewsDanger === b.ewsDanger &&
    a.ewsWarning === b.ewsWarning &&
    a.collisionHigh === b.collisionHigh &&
    a.collisionMedium === b.collisionMedium
  );
}

/**
 * Live records matching a search: MMSI prefix or a name containing the words of the query
 * (case and accent insensitive), MMSI matches first.
 */
export function searchLiveVessels(
  records: Iterable<VesselLiveRecord>,
  query: string,
  limit = 6,
): VesselLiveRecord[] {
  const text = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (text.length < 2) return [];
  const digits = /^\d+$/.test(text);
  const words = text.split(/\s+/);
  const byMmsi: VesselLiveRecord[] = [];
  const byName: VesselLiveRecord[] = [];
  for (const record of records) {
    if (digits && String(record.mmsi).startsWith(text)) byMmsi.push(record);
    else {
      const name = (record.vessel?.name ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
      if (name && words.every((word) => name.includes(word))) byName.push(record);
    }
    if (byMmsi.length >= limit) break;
  }
  byName.sort((a, b) => (a.vessel?.name ?? '').localeCompare(b.vessel?.name ?? ''));
  return [...byMmsi, ...byName].slice(0, limit);
}
