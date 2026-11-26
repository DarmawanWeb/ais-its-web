/**
 * Cost–benefit figures derived from the SEEMP responses. CO2 scales with the attained CII for
 * a fixed distance and capacity, so the CO2 avoided per year is the baseline CO2 times the
 * relative CII reduction.
 */

/** Relative reduction of the attained CII in percent (positive = less CO2). */
export function reductionPercent(before: number, after: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return null;
  return (1 - after / before) * 100;
}

/** USD per year for each percent of CII reduction. */
export function costPerPercent(costUsdPerYear: number, percent: number | null): number | null {
  if (percent === null || percent <= 0 || !Number.isFinite(costUsdPerYear)) return null;
  return costUsdPerYear / percent;
}

/** Tonnes of CO2 avoided per year for a baseline year's CO2 and a reduction in percent. */
export function co2Avoided(
  baselineCo2Ton: number | null | undefined,
  percent: number | null,
): number | null {
  if (baselineCo2Ton === null || baselineCo2Ton === undefined || percent === null) return null;
  if (!Number.isFinite(baselineCo2Ton) || baselineCo2Ton <= 0) return null;
  return (baselineCo2Ton * percent) / 100;
}

/** Abatement cost: USD per tonne of CO2 avoided. */
export function costPerTonne(costUsdPerYear: number, avoidedTon: number | null): number | null {
  if (avoidedTon === null || avoidedTon <= 0 || !Number.isFinite(costUsdPerYear)) return null;
  return costUsdPerYear / avoidedTon;
}

/** CO2 of a fuel mix: (ME + AE) × C_F, t. */
export function co2OfFuel(meTon: number, aeTon: number, conversionFactor: number): number {
  return (meTon + aeTon) * conversionFactor;
}
