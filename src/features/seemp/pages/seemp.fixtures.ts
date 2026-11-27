import { http, HttpResponse } from 'msw';

import type {
  AnnualCiiDto,
  FleetSummaryDto,
  SeempMeasureListDto,
  SeempRecommendationsDto,
  SeempScenarioDto,
  SeempSimulationDto,
} from '@/shared/api/generated/emission/model';
import type { VesselSummaryDto } from '@/shared/api/generated/fleet/model';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

/** Typed fixtures of the emission service SEEMP endpoints. */
export const YEAR = new Date().getUTCFullYear();
export const MMSI = 525005223;

export const MEASURES: SeempMeasureListDto = {
  data: [
    {
      code: 'hull_coating',
      name: 'Hull coating maintenance on the hull surface',
      category: 'operational',
      legacyOrder: 3,
      methodId: 'seemp.measure.hull_coating',
      reduction: { type: 'operational', potentialPercent: 10 },
      cost: { type: 'wetted_surface', usdPerM2: 100 },
      source: 'Bouman et al. 2017',
    },
    {
      code: 'lng',
      name: 'Use LNG as fuel for main and auxiliary engine',
      category: 'fuel',
      legacyOrder: 7,
      methodId: 'seemp.measure.lng',
      reduction: { type: 'fuel_switch', conversionFactor: 2.75 },
      cost: { type: 'installed_power', usdPerKw: 1580, mainEngine: true, auxEngines: true },
      source: 'IMO MEPC.364(79)',
    },
    {
      code: 'biofuel',
      name: 'Use biofuel as fuel for main and auxiliary engine',
      category: 'fuel',
      legacyOrder: 8,
      methodId: 'seemp.measure.biofuel',
      reduction: { type: 'fuel_switch', conversionFactor: 2.45 },
      cost: { type: 'installed_power', usdPerKw: 20, mainEngine: true, auxEngines: true },
      source: 'IMO MEPC.1/Circ.905',
    },
  ],
};

const recommendation = (
  code: string,
  ratingAfter: number,
  gradeAfter: 'A' | 'B' | 'C',
  costUsdPerYear: number,
) => ({
  recommendation: code,
  cost: `USD ${costUsdPerYear}`,
  ciiRatingAfter: ratingAfter,
  ciiGradeAfter: gradeAfter,
  ciiRatingBefore: 0.97,
  ciiGradeBefore: 'C' as const,
  code,
  costUsdPerYear,
  costRangeUsdPerYear: { low: costUsdPerYear, high: costUsdPerYear },
  ciiAttainedAfter: ratingAfter * 6.77,
  yearsUntilInferior: 5,
  recommended: true,
  methodIds: [`seemp.measure.${code}`, 'seemp.cost_amortization'],
});

export const RECOMMENDATIONS: SeempRecommendationsDto = {
  vessel: {
    vesselId: 'v1',
    mmsi: MMSI,
    imo: null,
    name: 'KM Bahari Nusantara',
    flag: 'ID',
    typeCode: 'bulk_carrier',
    typeName: 'Bulk carrier',
  },
  baselineCo2Ton: 15_120,
  includeAll: false,
  mmsi: MMSI,
  vesselId: 'v1',
  baselineYear: YEAR - 1,
  baselineSource: 'segments',
  targetYear: YEAR,
  ciiRequired: 6.77,
  ciiAttained: 6.72,
  ciiRatingBefore: 0.97,
  ciiGradeBefore: 'C',
  recommendations: [
    recommendation('biofuel', 0.777, 'A', 46_400),
    recommendation('hull_coating', 0.928, 'B', 148_000),
  ],
  methodIds: ['seemp.filter_sort_output', 'cii.required'],
};

export const SIMULATION: SeempSimulationDto = {
  vessel: {
    vesselId: 'v1',
    mmsi: MMSI,
    imo: null,
    name: 'KM Bahari Nusantara',
    flag: 'ID',
    typeCode: 'bulk_carrier',
    typeName: 'Bulk carrier',
  },
  mmsi: MMSI,
  vesselId: 'v1',
  baselineYear: YEAR - 1,
  baselineSource: 'segments',
  targetYear: YEAR,
  ciiRequired: 6.77,
  ciiAttained: 6.72,
  ciiRatingBefore: 0.97,
  ciiGradeBefore: 'C',
  measureCodes: ['hull_coating'],
  before: { attained: 6.72, rating: 0.993, grade: 'C' },
  after: { attained: 6.28, rating: 0.928, grade: 'B' },
  reductionPercent: 6.4,
  fuelAfter: { meTon: 4195.7, aeTon: 663.4, conversionFactor: 3.114 },
  yearsUntilInferior: 5,
  costUsdPerYear: 148_000,
  costRangeUsdPerYear: { low: 148_000, high: 148_000 },
  cost: 'USD 148000',
  baselineCo2Ton: 15_120,
  co2AvoidedTon: 967.7,
  costPerTonneUsd: 152.9,
  methodIds: ['seemp.simulation_combination'],
};

export const SCENARIO: SeempScenarioDto = {
  id: '0192f0c8-7d3a-7c2e-9a1b-00000000aa01',
  mmsi: MMSI,
  vesselId: 'v1',
  vesselName: 'KM Bahari Nusantara',
  name: 'Paket lambung',
  measureCodes: ['hull_coating'],
  baselineYear: YEAR - 1,
  targetYear: YEAR,
  result: SIMULATION,
  createdBy: 'u1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const FLEET: FleetSummaryDto = {
  year: YEAR,
  orgId: TEST_IDS.orgA,
  vessels: 2,
  grades: { A: 0, B: 0, C: 1, D: 1, E: 0 },
  notAvailable: 0,
  items: [
    {
      mmsi: MMSI,
      vesselId: 'v1',
      name: 'KM Bahari Nusantara',
      grade: 'C',
      rating: 0.95,
      attained: 6.44,
      source: 'segments',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
    {
      mmsi: 525019002,
      vesselId: 'v2',
      name: 'MT Selat Jaya',
      grade: 'D',
      rating: 1.15,
      attained: 9.98,
      source: 'segments',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
  ],
  meta: { page: 1, pageSize: 10, total: 2 },
  methodIds: ['cii.rating_grade'],
};

const ANNUAL: AnnualCiiDto = {
  vessel: {
    vesselId: 'v1',
    mmsi: MMSI,
    imo: null,
    name: 'KM Bahari Nusantara',
    flag: 'ID',
    typeCode: 'bulk_carrier',
    typeName: 'Bulk carrier',
  },
  mmsi: MMSI,
  vesselId: 'v1',
  dVector: { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 },
  years: [],
};

const VESSEL: VesselSummaryDto = {
  view: 'summary',
  id: 'v1',
  mmsi: MMSI,
  imo: '9040236',
  name: 'KM Bahari Nusantara',
  flag: 'ID',
  type: { id: 't1', code: 'tanker', name: 'Tanker', icon: null },
  status: 'active',
  photoUrl: null,
  updatedAt: new Date().toISOString(),
};

export { problemResponse } from '@/test/msw/problem';

/** The SEEMP endpoints; `overrides` replace single handlers. */
export function mockSeemp(
  overrides: {
    fleet?: () => Response;
    recommendations?: () => Response;
    scenarios?: () => Response;
  } = {},
) {
  const deleted: string[] = [];
  server.use(
    http.get('*/api/v2/cii/fleet/summary', () =>
      overrides.fleet ? overrides.fleet() : HttpResponse.json(FLEET),
    ),
    http.get('*/api/v2/cii/vessels/:mmsi/annual', () => HttpResponse.json(ANNUAL)),
    http.get('*/api/v2/vessels', () =>
      HttpResponse.json({ data: [VESSEL], meta: { page: 1, pageSize: 5, total: 1 } }),
    ),
    http.get('*/api/v2/seemp/measures', () => HttpResponse.json(MEASURES)),
    http.get('*/api/v2/seemp/vessels/:mmsi/recommendations', () =>
      overrides.recommendations ? overrides.recommendations() : HttpResponse.json(RECOMMENDATIONS),
    ),
    http.post('*/api/v2/seemp/vessels/:mmsi/simulate', () => HttpResponse.json(SIMULATION)),
    http.get('*/api/v2/seemp/scenarios', () =>
      overrides.scenarios
        ? overrides.scenarios()
        : HttpResponse.json({
            data: deleted.includes(SCENARIO.id) ? [] : [SCENARIO],
            meta: { page: 1, pageSize: 10, total: deleted.includes(SCENARIO.id) ? 0 : 1 },
          }),
    ),
    http.delete('*/api/v2/seemp/scenarios/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { deleted };
}
