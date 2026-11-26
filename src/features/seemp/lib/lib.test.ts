import { describe, expect, it } from 'vitest';

import type { SeempMeasureDto } from '@/shared/api/generated/emission/model';
import { ApiProblem } from '@/shared/api/problem';

import { co2Avoided, co2OfFuel, costPerPercent, costPerTonne, reductionPercent } from './economics';
import { correctiveCount, gradeSteps, seempPriority } from './grade-style';
import {
  costOf,
  groupByCategory,
  incompatibleCodes,
  inLegacyOrder,
  isFuelSwitch,
  reductionOf,
} from './measures';
import { seempProblemKey } from './problems';

const measure = (
  code: string,
  legacyOrder: number,
  category: SeempMeasureDto['category'],
  reduction: SeempMeasureDto['reduction'],
  cost: SeempMeasureDto['cost'] = { type: 'range', lowUsd: 100, highUsd: 200 },
): SeempMeasureDto => ({
  code,
  name: code,
  category,
  legacyOrder,
  methodId: `seemp.measure.${code}`,
  reduction,
  cost,
  source: 'legacy',
});

const MEASURES = [
  measure('hull_coating', 3, 'operational', { type: 'operational', potentialPercent: 10 }),
  measure('air_lubrication', 1, 'technical', { type: 'operational', potentialPercent: 8 }),
  measure('lng', 7, 'fuel', { type: 'fuel_switch', conversionFactor: 2.75 }),
  measure('biofuel', 8, 'fuel', { type: 'fuel_switch', conversionFactor: 2.45 }),
  measure('cold_ironing', 11, 'energy', {
    type: 'auxiliary',
    potentialShare: 0.2,
    coldIroning: true,
    voyagePercent: 10,
  }),
];

describe('cost–benefit figures', () => {
  it('derives the reduction, cost per percent and abatement cost', () => {
    expect(reductionPercent(10, 9)).toBeCloseTo(10);
    expect(reductionPercent(0, 9)).toBeNull();
    expect(costPerPercent(50_000, 10)).toBe(5_000);
    expect(costPerPercent(50_000, 0)).toBeNull();
    expect(co2Avoided(15_000, 10)).toBe(1_500);
    expect(co2Avoided(null, 10)).toBeNull();
    expect(costPerTonne(45_000, 1_500)).toBe(30);
    expect(costPerTonne(45_000, null)).toBeNull();
    expect(co2OfFuel(10, 2, 3.114)).toBeCloseTo(37.368);
  });
});

describe('measures', () => {
  it('parses the reduction and cost models and rejects unknown shapes', () => {
    expect(reductionOf(MEASURES[0]!)).toEqual({ type: 'operational', potentialPercent: 10 });
    expect(reductionOf({ reduction: { type: 'magic' } })).toBeNull();
    expect(costOf(MEASURES[0]!)).toEqual({ type: 'range', lowUsd: 100, highUsd: 200 });
    expect(costOf({ cost: { type: 'installed_power', usdPerKw: 500 } })).toEqual({
      type: 'installed_power',
      usdPerKw: 500,
      mainEngine: false,
      auxEngines: false,
      fixedUsd: 0,
    });
    expect(isFuelSwitch(MEASURES[2]!)).toBe(true);
    expect(isFuelSwitch(MEASURES[4]!)).toBe(false);
  });

  it('groups by category in display order, legacy order inside a group', () => {
    const groups = groupByCategory(MEASURES);
    expect(groups.map((group) => group.category)).toEqual([
      'technical',
      'operational',
      'fuel',
      'energy',
    ]);
    expect(groups[2]?.measures.map((item) => item.code)).toEqual(['lng', 'biofuel']);
  });

  it('flags two fuel switches (422 SEEMP_MEASURES_INCOMPATIBLE) and orders like the service', () => {
    expect(incompatibleCodes(['lng', 'hull_coating'], MEASURES)).toEqual([]);
    expect(incompatibleCodes(['biofuel', 'lng'], MEASURES)).toEqual(['lng', 'biofuel']);
    expect(inLegacyOrder(['cold_ironing', 'air_lubrication', 'lng', 'lng'], MEASURES)).toEqual([
      'air_lubrication',
      'lng',
      'cold_ironing',
    ]);
  });
});

describe('grades and priorities', () => {
  it('counts grade steps and the planning priority', () => {
    expect(gradeSteps('D', 'B')).toBe(2);
    expect(gradeSteps('B', 'C')).toBe(-1);
    expect(gradeSteps(null, 'C')).toBeNull();
    expect(seempPriority('E')).toBe('corrective');
    expect(seempPriority('D')).toBe('corrective');
    expect(seempPriority('C')).toBe('monitor');
    expect(seempPriority('A')).toBe('compliant');
    expect(seempPriority(null)).toBe('noData');
    expect(correctiveCount({ A: 1, B: 0, C: 3, D: 2, E: 1 })).toBe(3);
    expect(correctiveCount(undefined)).toBe(0);
  });
});

describe('problems', () => {
  it('maps SEEMP error codes', () => {
    const problem = (status: number, code: string) =>
      new ApiProblem({ kind: 'http', status, code, title: code });
    expect(seempProblemKey(problem(422, 'SEEMP_MEASURES_INCOMPATIBLE'))).toBe('incompatible');
    expect(seempProblemKey(problem(404, 'SEEMP_SCENARIO_NOT_FOUND'))).toBe('scenarioNotFound');
    expect(seempProblemKey(problem(404, 'CII_NOT_AVAILABLE'))).toBe('notAvailable');
    expect(seempProblemKey(problem(403, 'OTHER'))).toBe('forbidden');
    expect(seempProblemKey(problem(500, 'INTERNAL_ERROR'))).toBeNull();
  });
});
