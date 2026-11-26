import * as z from 'zod';

import type { SeempMeasureDto } from '@/shared/api/generated/emission/model';

/** Measure categories in display order (seed `seemp_measures.category`). */
export const CATEGORIES = ['technical', 'operational', 'fuel', 'energy'] as const;
export type MeasureCategory = (typeof CATEGORIES)[number];

/** Reduction models of the 12 legacy measures (emission README "SEEMP", types 1–3). */
const ReductionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('operational'), potentialPercent: z.number() }),
  z.object({ type: z.literal('fuel_switch'), conversionFactor: z.number() }),
  z.object({
    type: z.literal('auxiliary'),
    potentialShare: z.number(),
    coldIroning: z.boolean().default(false),
    voyagePercent: z.number().nullable().default(null),
  }),
]);
export type ReductionModel = z.infer<typeof ReductionSchema>;

/** Cost models: LOA bands, a range, per m² of wetted surface, per kW installed. */
const CostSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('loa_bands'),
    bands: z.array(z.object({ maxLoaM: z.number().nullable(), usd: z.number() })),
  }),
  z.object({ type: z.literal('range'), lowUsd: z.number(), highUsd: z.number() }),
  z.object({ type: z.literal('wetted_surface'), usdPerM2: z.number() }),
  z.object({
    type: z.literal('installed_power'),
    usdPerKw: z.number(),
    mainEngine: z.boolean().default(false),
    auxEngines: z.boolean().default(false),
    fixedUsd: z.number().default(0),
  }),
]);
export type CostModel = z.infer<typeof CostSchema>;

/** The reduction model of a measure, or null when the service sent an unknown shape. */
export function reductionOf(measure: Pick<SeempMeasureDto, 'reduction'>): ReductionModel | null {
  const parsed = ReductionSchema.safeParse(measure.reduction);
  return parsed.success ? parsed.data : null;
}

/** The cost model of a measure, or null when the service sent an unknown shape. */
export function costOf(measure: Pick<SeempMeasureDto, 'cost'>): CostModel | null {
  const parsed = CostSchema.safeParse(measure.cost);
  return parsed.success ? parsed.data : null;
}

export function isCategory(value: string): value is MeasureCategory {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** Measures grouped by category in display order, each group in legacy order. */
export function groupByCategory<T extends Pick<SeempMeasureDto, 'category' | 'legacyOrder'>>(
  measures: readonly T[],
): { category: MeasureCategory; measures: T[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    measures: measures
      .filter((measure) => measure.category === category)
      .sort((a, b) => a.legacyOrder - b.legacyOrder),
  })).filter((group) => group.measures.length > 0);
}

/** True when the measure switches the fuel (at most one per simulation). */
export function isFuelSwitch(measure: Pick<SeempMeasureDto, 'reduction'>): boolean {
  return reductionOf(measure)?.type === 'fuel_switch';
}

/**
 * Codes of the selected fuel switches when more than one is selected (the service answers
 * `422 SEEMP_MEASURES_INCOMPATIBLE`); empty when the selection is valid.
 */
export function incompatibleCodes(
  selected: readonly string[],
  measures: readonly Pick<SeempMeasureDto, 'code' | 'reduction'>[],
): string[] {
  const fuel = measures.filter(
    (measure) => selected.includes(measure.code) && isFuelSwitch(measure),
  );
  return fuel.length > 1 ? fuel.map((measure) => measure.code) : [];
}

/** Selected codes in legacy order (the order the service applies them). */
export function inLegacyOrder(
  selected: readonly string[],
  measures: readonly Pick<SeempMeasureDto, 'code' | 'legacyOrder'>[],
): string[] {
  const order = new Map(measures.map((measure) => [measure.code, measure.legacyOrder]));
  return [...new Set(selected)].sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}
