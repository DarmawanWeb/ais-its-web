import type { FleetVesselCiiDto, PreviousYearCiiDto } from '@/shared/api/generated/emission/model';

import { requiredOf } from './grades';

/** Rating and grade of the previous year (emission 0.2 embeds them as `previousYear`). */
export type PreviousCii = Pick<PreviousYearCiiDto, 'rating' | 'grade'>;

export interface FleetRow extends Omit<FleetVesselCiiDto, 'required'> {
  required: number | null;
  previous: PreviousCii | null;
}

/** True when the service predates `previousYear` / `required` (the page then joins year − 1). */
export function needsPreviousYearPage(items: readonly FleetVesselCiiDto[] | undefined): boolean {
  return (items ?? []).some(
    (item) => (item as Partial<FleetVesselCiiDto>).previousYear === undefined,
  );
}

/**
 * Rows of the fleet table: the service's `required` and `previousYear` when present, otherwise
 * the required CII recovered as attained / rating and the same vessel in `previousItems`.
 */
export function toFleetRows(
  items: readonly FleetVesselCiiDto[],
  previousItems?: readonly FleetVesselCiiDto[],
): FleetRow[] {
  const previous = new Map((previousItems ?? []).map((item) => [item.mmsi, item]));
  return items.map((item) => ({
    ...item,
    required: item.required ?? requiredOf(item.attained, item.rating),
    previous: item.previousYear ?? previous.get(item.mmsi) ?? null,
  }));
}
