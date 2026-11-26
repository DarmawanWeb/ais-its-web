import type {
  MethodCountsDto,
  SegmentDto,
  SegmentDtoMethod,
} from '@/shared/api/generated/emission/model';

/** Fuel methods in priority order (spec §13.5: telemetry → first formula → Holtrop). */
export const FUEL_METHODS = ['telemetry', 'first_formula', 'holtrop'] as const;
export type FuelMethod = (typeof FUEL_METHODS)[number];

/** Flags the emission service sets on segments (README "Segments", troubleshooting). */
export const KNOWN_SEGMENT_FLAGS = [
  'gap',
  'no_fuel_model',
  'weather_unavailable',
  'telemetry_reattributed',
  'formula_error',
  'fuel_not_finite',
  'fuel_negative',
] as const;

/** Methodology id of the fuel model behind a segment's figures. */
export function segmentMethodId(method: SegmentDtoMethod): string {
  switch (method) {
    case 'telemetry':
      return 'telemetry.fuel_reading_usage';
    case 'first_formula':
      return 'fuel.first_formula';
    case 'holtrop':
      return 'fuel.second_formula_me';
    default:
      return 'fuel.method_selection';
  }
}

/** Counts per method keyed like the API's `MethodCountsDto`. */
export function methodCount(
  counts: MethodCountsDto | null | undefined,
  method: FuelMethod,
): number {
  if (!counts) return 0;
  if (method === 'first_formula') return counts.firstFormula;
  return counts[method];
}

/** Share of the counted segments per method (0–1), in priority order. */
export function methodShares(
  counts: MethodCountsDto | null | undefined,
): { method: FuelMethod; count: number; share: number }[] {
  const total = FUEL_METHODS.reduce((sum, method) => sum + methodCount(counts, method), 0);
  return FUEL_METHODS.map((method) => {
    const count = methodCount(counts, method);
    return { method, count, share: total > 0 ? count / total : 0 };
  });
}

/** True when weather-derived values (Holtrop with Open-Meteo wind) are among the figures. */
export function usesWeather(counts: MethodCountsDto | null | undefined): boolean {
  return (counts?.holtrop ?? 0) > 0;
}

/** True when a segment page shows weather-derived values (Open-Meteo or the Holtrop model). */
export function segmentsUseWeather(segments: readonly SegmentDto[] | undefined): boolean {
  return (segments ?? []).some(
    (segment) => segment.method === 'holtrop' || segment.weather?.source === 'open-meteo',
  );
}

/** Duration of a segment in minutes. */
export function segmentMinutes(segment: Pick<SegmentDto, 'timeStart' | 'timeEnd'>): number {
  const ms = Date.parse(segment.timeEnd) - Date.parse(segment.timeStart);
  return Number.isFinite(ms) ? Math.max(0, ms / 60_000) : 0;
}

/** Longest range of `GET …/segments` (README: ≤ 31 days). */
export const SEGMENTS_MAX_DAYS = 31;

/** Clamps a [from, to] range to the last `SEGMENTS_MAX_DAYS` days before `to`. */
export function clampSegmentRange(from: Date, to: Date): { from: Date; to: Date } {
  const maxMs = SEGMENTS_MAX_DAYS * 24 * 3_600_000;
  if (to.getTime() - from.getTime() <= maxMs) return { from, to };
  return { from: new Date(to.getTime() - maxMs), to };
}
