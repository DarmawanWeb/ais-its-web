import type { RegistryParticularsDto, VesselTypeDto } from '@/shared/api/generated/fleet/model';

import { FLAG_PATTERN, type VesselFormValues } from './vessel-form';

/** A field the registry lookup can prefill, with the value it proposes. */
export interface RegistryPrefill {
  field:
    | 'name'
    | 'mmsi'
    | 'imo'
    | 'flag'
    | 'builtYear'
    | 'typeId'
    | 'dimensions.gt'
    | 'dimensions.dwt'
    | 'dimensions.loa'
    | 'dimensions.b'
    | 'dimensions.t';
  value: string | number;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Ship type of the catalogue that matches a registry type name ("Tanker", "General Cargo"):
 * exact name/code first, then a name containing the registry words (or the reverse).
 */
export function matchVesselType(
  entry: Pick<RegistryParticularsDto, 'type' | 'typeName'>,
  types: readonly Pick<VesselTypeDto, 'id' | 'code' | 'name'>[],
): string | null {
  const candidates = [entry.typeName, entry.type]
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .filter(Boolean);
  for (const wanted of candidates) {
    const exact = types.find(
      (type) => normalize(type.name) === wanted || normalize(type.code) === wanted,
    );
    if (exact) return exact.id;
  }
  for (const wanted of candidates) {
    const partial = types.find((type) => {
      const name = normalize(type.name);
      const code = normalize(type.code);
      return name.includes(wanted) || wanted.includes(name) || code.includes(wanted);
    });
    if (partial) return partial.id;
  }
  return null;
}

/** Values of a registry entry for the vessel form (only the ones the entry knows). */
export function registryPrefill(
  entry: RegistryParticularsDto,
  types: readonly Pick<VesselTypeDto, 'id' | 'code' | 'name'>[] = [],
): RegistryPrefill[] {
  const prefill: RegistryPrefill[] = [{ field: 'name', value: entry.name }];
  prefill.push({ field: 'mmsi', value: entry.mmsi });
  if (entry.imo) prefill.push({ field: 'imo', value: entry.imo.replace(/^IMO\s*/i, '') });
  const flag = entry.flag?.trim().toUpperCase();
  if (flag && FLAG_PATTERN.test(flag)) prefill.push({ field: 'flag', value: flag });
  if (entry.built && entry.built >= 1800 && entry.built <= 2200) {
    prefill.push({ field: 'builtYear', value: entry.built });
  }
  const typeId = matchVesselType(entry, types);
  if (typeId) prefill.push({ field: 'typeId', value: typeId });
  if (entry.gt !== null) prefill.push({ field: 'dimensions.gt', value: entry.gt });
  if (entry.dwt !== null) prefill.push({ field: 'dimensions.dwt', value: entry.dwt });
  if (entry.loaM !== null) prefill.push({ field: 'dimensions.loa', value: entry.loaM });
  if (entry.beamM !== null) prefill.push({ field: 'dimensions.b', value: entry.beamM });
  if (entry.draughtM !== null) prefill.push({ field: 'dimensions.t', value: entry.draughtM });
  return prefill;
}

/** Applies a prefill to form values (pure; the form applies the same fields with `setValue`). */
export function applyPrefill(values: VesselFormValues, prefill: readonly RegistryPrefill[]) {
  const next: VesselFormValues = { ...values, dimensions: { ...values.dimensions } };
  for (const { field, value } of prefill) {
    switch (field) {
      case 'dimensions.gt':
      case 'dimensions.dwt':
      case 'dimensions.loa':
      case 'dimensions.b':
      case 'dimensions.t':
        next.dimensions[field.slice('dimensions.'.length) as 'gt' | 'dwt' | 'loa' | 'b' | 't'] =
          Number(value);
        break;
      case 'mmsi':
      case 'builtYear':
        next[field] = Number(value);
        break;
      default:
        next[field] = String(value);
    }
  }
  return next;
}
