// SEEMP of the emission service (spec §13.5, services/emission/README.md "SEEMP"): the 12 legacy
// measures, recommendations (grades A–C after, cheapest per year first), the sequential
// multiplicative simulation and saved scenarios. The baseline numbers match routes/cii.mjs.
import { randomUUID } from 'node:crypto';

import { assignCiiGrade } from '@darmawanweb/ais-its-contracts/domain';

import { FLEET_ORG_ID, MockHttpError, nowIso, pageOf, USERS, vesselId, VESSELS } from '../lib.mjs';

const MEASURES = [
  [
    'air_lubrication',
    'Modified and install hull air cavity lubrication system on ship',
    'technical',
    { type: 'operational', potentialPercent: 8 },
    {
      type: 'loa_bands',
      bands: [
        { maxLoaM: 100, usd: 430000 },
        { maxLoaM: 200, usd: 850000 },
        { maxLoaM: null, usd: 1280000 },
      ],
    },
    'first-formula.ts#calculateAirLubrication',
  ],
  [
    'resistance_reduction_devices',
    'Modified and install resistance reduction devices on ship',
    'technical',
    { type: 'operational', potentialPercent: 9 },
    { type: 'range', lowUsd: 300000, highUsd: 700000 },
    'first-formula.ts#calculateResistanceReduceDevice',
  ],
  [
    'hull_coating',
    'Hull coating maintenance on the hull surface',
    'operational',
    { type: 'operational', potentialPercent: 10 },
    { type: 'wetted_surface', usdPerM2: 100 },
    'first-formula.ts#calculateHullCoating',
  ],
  [
    'power_system_machinery',
    'Variable speed electric power generation',
    'technical',
    { type: 'operational', potentialPercent: 10 },
    { type: 'installed_power', usdPerKw: 500, mainEngine: true, auxEngines: false, fixedUsd: 0 },
    'first-formula.ts#calculatePowerSystemMachinery',
  ],
  [
    'propulsion_efficiency_devices',
    'Install propulsion exfficiency devices',
    'technical',
    { type: 'operational', potentialPercent: 13 },
    { type: 'range', lowUsd: 100000, highUsd: 800000 },
    'first-formula.ts#calculatePropEffDevice',
  ],
  [
    'waste_heat_recovery',
    'Utilize waste heat recovery from machinery devices on ship',
    'technical',
    { type: 'operational', potentialPercent: 10 },
    { type: 'installed_power', usdPerKw: 100, mainEngine: true, auxEngines: true, fixedUsd: 0 },
    'first-formula.ts#calculateWasteHeatRecovery',
  ],
  [
    'lng',
    'Using LNG for main engine and auxiliary engine',
    'fuel',
    { type: 'fuel_switch', conversionFactor: 2.75 },
    { type: 'installed_power', usdPerKw: 1580, mainEngine: true, auxEngines: true, fixedUsd: 0 },
    'second-formula.ts#calculateLNGFuel',
  ],
  [
    'biofuel',
    'Using biofuels for main engine and auxiliary engine',
    'fuel',
    { type: 'fuel_switch', conversionFactor: 2.45 },
    { type: 'installed_power', usdPerKw: 20, mainEngine: true, auxEngines: true, fixedUsd: 0 },
    'second-formula.ts#calculateBioFuel',
  ],
  [
    'solar',
    'Using solar panel energy source for supply electricity demand on ship',
    'energy',
    { type: 'auxiliary', potentialShare: 0.12, coldIroning: false, voyagePercent: 42 },
    { type: 'installed_power', usdPerKw: 3000, mainEngine: false, auxEngines: true, fixedUsd: 0 },
    'third-formula.ts#calculateSolarPower',
  ],
  [
    'wind',
    'Using wind power energy source for supply electricity demand on ship',
    'energy',
    { type: 'auxiliary', potentialShare: 0.15, coldIroning: false, voyagePercent: 0 },
    { type: 'installed_power', usdPerKw: 4000, mainEngine: false, auxEngines: true, fixedUsd: 0 },
    'third-formula.ts#calculateWindPower',
  ],
  [
    'cold_ironing',
    'Using cold ironing energy source for supply electricity demand on ship',
    'energy',
    { type: 'auxiliary', potentialShare: 0.1, coldIroning: true, voyagePercent: null },
    {
      type: 'installed_power',
      usdPerKw: 0.5,
      mainEngine: false,
      auxEngines: true,
      fixedUsd: 800150,
    },
    'third-formula.ts#calculateColdIroning',
  ],
  [
    'fuel_cells',
    'Using fuel cells energy source for supply electricity demand on ship',
    'energy',
    { type: 'auxiliary', potentialShare: 0.2, coldIroning: false, voyagePercent: 0 },
    { type: 'installed_power', usdPerKw: 1780, mainEngine: false, auxEngines: true, fixedUsd: 0 },
    'third-formula.ts#calculateFuelCells',
  ],
].map(([code, name, category, reduction, cost, legacy], index) => ({
  code,
  name,
  category,
  legacyOrder: index + 1,
  methodId: `seemp.measure.${code}`,
  reduction,
  cost,
  source: `MVP be-legacy/src/utils/seemp/${legacy} (thesis, needs citation)`,
}));

const Z = {
  2023: 5,
  2024: 7,
  2025: 9,
  2026: 11,
  2027: 13.625,
  2028: 16.25,
  2029: 18.875,
  2030: 21.5,
};
const LAST_Z_YEAR = 2030;

/** Same reference lines, d-vectors, capacities and ratings as routes/cii.mjs, plus hull data. */
const TYPES = {
  tanker: { a: 5247, c: 0.61, d: { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 } },
  ro_ro_passenger_ship: { a: 7540, c: 0.587, d: { d1: 0.72, d2: 0.9, d3: 1.12, d4: 1.41 } },
  general_cargo_ship: { a: 588, c: 0.3885, d: { d1: 0.83, d2: 0.94, d3: 1.06, d4: 1.19 } },
  container_ship: { a: 1984, c: 0.489, d: { d1: 0.83, d2: 0.94, d3: 1.07, d4: 1.19 } },
  refrigerated_cargo_carrier: { a: 4600, c: 0.557, d: { d1: 0.78, d2: 0.91, d3: 1.07, d4: 1.2 } },
  bulk_carrier: { a: 4745, c: 0.622, d: { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.18 } },
  lng_carrier: { a: 9.827, c: 0, d: { d1: 0.89, d2: 0.98, d3: 1.06, d4: 1.13 } },
  ro_ro_cargo_ship_vc: { a: 5739, c: 0.631, d: { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.16 } },
  gas_carrier: { a: 8104, c: 0.639, d: { d1: 0.85, d2: 0.95, d3: 1.06, d4: 1.25 } },
  cruise_passenger_ship: { a: 930, c: 0.383, d: { d1: 0.87, d2: 0.95, d3: 1.06, d4: 1.16 } },
  combination_carrier: { a: 40853, c: 0.812, d: { d1: 0.87, d2: 0.96, d3: 1.06, d4: 1.14 } },
};

// [capacity, ratings, manual years, LOA m, wetted surface m², ME kW, AE kW, share at sea %, fuel t/yr]
const PROFILES = {
  525005223: [
    45_000,
    { 2023: 1.02, 2024: 0.99, 2025: 0.97, 2026: 0.95 },
    [2023],
    183,
    7_400,
    9_800,
    1_800,
    64,
    9_100,
  ],
  525019001: [
    3_000,
    { 2023: 0.97, 2024: 0.93, 2025: 0.89, 2026: 0.85 },
    [],
    68,
    1_250,
    4_400,
    720,
    58,
    2_600,
  ],
  525019002: [
    30_000,
    { 2023: 1.02, 2024: 1.06, 2025: 1.09, 2026: 1.15 },
    [],
    170,
    6_300,
    8_400,
    1_500,
    61,
    7_200,
  ],
  525019003: [
    8_000,
    { 2023: 0.88, 2024: 0.86, 2025: 0.83, 2026: 0.8 },
    [2023],
    110,
    2_600,
    3_300,
    640,
    55,
    2_100,
  ],
  563012345: [
    50_000,
    { 2023: 0.95, 2024: 0.94, 2025: 0.92, 2026: 0.9 },
    [],
    255,
    11_200,
    32_000,
    4_200,
    72,
    24_000,
  ],
  563045678: [
    9_000,
    { 2023: 0.96, 2024: 0.97, 2025: 0.99, 2026: 1.0 },
    [],
    140,
    3_900,
    8_900,
    2_400,
    69,
    5_400,
  ],
  538007788: [
    60_000,
    { 2023: 1.1, 2024: 1.14, 2025: 1.19, 2026: 1.25 },
    [],
    199,
    9_600,
    9_500,
    1_700,
    66,
    8_800,
  ],
  525019005: [
    80_000,
    { 2023: 0.9, 2024: 0.89, 2025: 0.87, 2026: 0.86 },
    [],
    290,
    13_500,
    28_000,
    6_000,
    75,
    26_000,
  ],
  636019900: [
    50_000,
    { 2023: 1.0, 2024: 1.03, 2025: 1.06, 2026: 1.1 },
    [],
    200,
    9_000,
    14_000,
    3_100,
    70,
    11_000,
  ],
  525019006: [2_500, { 2024: 1.01, 2025: 0.98, 2026: 0.95 }, [], 62, 1_100, 3_600, 560, 57, 2_200],
  525019007: [
    20_000,
    { 2023: 0.97, 2024: 0.95, 2025: 0.93, 2026: 0.92 },
    [2023],
    155,
    5_200,
    7_200,
    1_400,
    60,
    6_100,
  ],
  525019008: [
    60_000,
    { 2023: 1.06, 2024: 1.05, 2025: 1.04, 2026: 1.02 },
    [],
    260,
    12_800,
    36_000,
    9_000,
    68,
    30_000,
  ],
  525019009: [
    40_000,
    { 2023: 1.08, 2024: 1.05 },
    [2023, 2024],
    186,
    7_100,
    9_000,
    1_600,
    60,
    8_000,
  ],
};

const AE_SHARE = 0.14;
const CF_MIX = 3.127;

const SEED_SCENARIOS = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1d-000000000001',
    mmsi: 525005223,
    name: 'Paket teknis hemat',
    measureCodes: ['hull_coating', 'propulsion_efficiency_devices'],
    createdAt: '2026-11-18T08:15:00.000Z',
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1d-000000000002',
    mmsi: 525005223,
    name: 'Transisi LNG',
    measureCodes: ['waste_heat_recovery', 'lng'],
    createdAt: '2026-11-19T10:40:00.000Z',
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1d-000000000003',
    mmsi: 525019002,
    name: 'Pemulihan peringkat C',
    measureCodes: ['air_lubrication', 'hull_coating', 'fuel_cells'],
    createdAt: '2026-11-20T03:05:00.000Z',
  },
];

let scenarios = [];

function seed() {
  scenarios = SEED_SCENARIOS.map((item) => {
    const result = simulate(item.mmsi, item.measureCodes, {});
    return {
      id: item.id,
      mmsi: item.mmsi,
      vesselId: vesselId(item.mmsi),
      name: item.name,
      measureCodes: result.measureCodes,
      baselineYear: result.baselineYear,
      targetYear: result.targetYear,
      result,
      createdBy: USERS[1].id,
      createdAt: item.createdAt,
    };
  });
}

export function reset() {
  seed();
}

// --- model --------------------------------------------------------------------------------

const round = (value, digits = 8) => Number(value.toFixed(digits));
const thisYear = () => new Date().getUTCFullYear();

function resolveVessel(params, claims) {
  if (!/^\d{9}$/.test(params.mmsi ?? '')) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'mmsi', message: 'mmsi must be 9 digits' }],
    });
  }
  const mmsi = Number(params.mmsi);
  const vessel = VESSELS.find(([value]) => value === mmsi);
  if (!vessel) throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found');
  if (!(claims?.roles ?? []).includes('super_admin') && claims?.org !== FLEET_ORG_ID) {
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden', {
      detail: 'The vessel belongs to another organization',
    });
  }
  return vessel;
}

function context(mmsi, { year, targetYear }) {
  const vessel = VESSELS.find(([value]) => value === mmsi);
  const profile = PROFILES[mmsi];
  const type = vessel ? TYPES[vessel[2]] : undefined;
  const [capacity, ratings, manual, loa, wetted, meKw, aeKw, seaShare] = profile ?? [];
  const target = targetYear ?? thisYear();
  const years = Object.keys(ratings ?? {})
    .map(Number)
    .sort();
  const baselineYear =
    year ??
    (ratings?.[target - 1] !== undefined
      ? target - 1
      : years.filter((item) => item <= target).at(-1));
  if (!profile || !type || baselineYear === undefined || ratings[baselineYear] === undefined) {
    throw new MockHttpError(404, 'CII_NOT_AVAILABLE', 'CII not available', {
      detail: `No baseline CII for MMSI ${mmsi}`,
    });
  }
  if (Z[target] === undefined || Z[baselineYear] === undefined) {
    throw new MockHttpError(422, 'REDUCTION_FACTOR_MISSING', 'Reduction factor missing', {
      detail: `No reduction factor for ${Z[target] === undefined ? target : baselineYear}`,
    });
  }
  const reference = type.a * capacity ** -type.c;
  const required = (y) => (1 - Z[y] / 100) * reference;
  const attained = ratings[baselineYear] * required(baselineYear);
  const previous = ratings[target - 1];
  return {
    type,
    attained,
    required,
    requiredTarget: required(target),
    baselineYear,
    baselineSource: manual.includes(baselineYear) ? 'manual' : 'segments',
    targetYear: target,
    ratingBefore: previous ?? null,
    gradeBefore: previous === undefined ? null : assignCiiGrade(previous, type.d),
    loa,
    wetted,
    meKw,
    aeKw,
    seaShare,
    fuelTon: profile[8],
  };
}

function investment(measure, ctx) {
  const cost = measure.cost;
  switch (cost.type) {
    case 'loa_bands': {
      const band = cost.bands.find((item) => item.maxLoaM === null || ctx.loa <= item.maxLoaM);
      return { mean: band.usd, low: band.usd, high: band.usd };
    }
    case 'range':
      return { mean: (cost.lowUsd + cost.highUsd) / 2, low: cost.lowUsd, high: cost.highUsd };
    case 'wetted_surface': {
      const usd = ctx.wetted * cost.usdPerM2;
      return { mean: usd, low: usd, high: usd };
    }
    default: {
      const kw = (cost.mainEngine ? ctx.meKw : 0) + (cost.auxEngines ? ctx.aeKw : 0);
      const usd = kw * cost.usdPerKw + cost.fixedUsd;
      return { mean: usd, low: usd, high: usd };
    }
  }
}

/** Years until the attained CII would fall to grade D/E as Z tightens (at least 1). */
function yearsUntilInferior(attainedAfter, ctx) {
  let years = 0;
  for (let year = ctx.targetYear; year <= LAST_Z_YEAR; year += 1) {
    const grade = assignCiiGrade(attainedAfter / ctx.required(year), ctx.type.d);
    if (grade === 'D' || grade === 'E') break;
    years += 1;
  }
  return Math.max(1, years);
}

/** Sequential multiplicative combination (README "Simulation combination model"). */
function combine(codes, ctx) {
  const selected = MEASURES.filter((measure) => codes.includes(measure.code));
  const fuelSwitches = selected.filter((measure) => measure.reduction.type === 'fuel_switch');
  if (fuelSwitches.length > 1) {
    throw new MockHttpError(422, 'SEEMP_MEASURES_INCOMPATIBLE', 'Incompatible measures', {
      detail: 'At most one fuel switch can be combined',
    });
  }
  let cf = CF_MIX;
  let ae = ctx.fuelTon * AE_SHARE;
  let me = ctx.fuelTon - ae;
  let fuelSide = false;
  for (const measure of selected) {
    const reduction = measure.reduction;
    if (reduction.type === 'fuel_switch') {
      cf = reduction.conversionFactor;
      fuelSide = true;
    } else if (reduction.type === 'auxiliary') {
      ae = reduction.coldIroning
        ? ae * (1 - (100 - ctx.seaShare) / 100) + (ae * (100 - ctx.seaShare) * 0.8) / 100
        : ae * (1 - reduction.potentialShare);
      fuelSide = true;
    }
  }
  let attained = fuelSide
    ? (ctx.attained * ((me + ae) * cf)) / (ctx.fuelTon * CF_MIX)
    : ctx.attained;
  for (const measure of selected) {
    if (measure.reduction.type === 'operational') {
      const factor = 1 - (measure.reduction.potentialPercent * ctx.seaShare) / 10_000;
      attained *= factor;
      me *= factor;
    }
  }
  return { attained, me, ae, cf, measures: selected };
}

function simulate(mmsi, codes, years) {
  const unknown = codes.filter((code) => !MEASURES.some((measure) => measure.code === code));
  if (unknown.length > 0) {
    throw new MockHttpError(422, 'SEEMP_MEASURE_UNKNOWN', 'Unknown measure', {
      detail: `Unknown measure ${unknown[0]}`,
    });
  }
  const ctx = context(mmsi, years);
  const combined = combine(codes, ctx);
  const ratingBefore = ctx.attained / ctx.requiredTarget;
  const ratingAfter = combined.attained / ctx.requiredTarget;
  const yearsLeft = yearsUntilInferior(combined.attained, ctx);
  const costs = combined.measures.map((measure) => investment(measure, ctx));
  const total = costs.reduce(
    (sum, cost) => ({
      mean: sum.mean + cost.mean,
      low: sum.low + cost.low,
      high: sum.high + cost.high,
    }),
    { mean: 0, low: 0, high: 0 },
  );
  const perYear = (value) => (yearsLeft <= 1 ? value : value / yearsLeft);
  const usd = (value) => `$${Math.round(value).toLocaleString('en-US')}`;
  return {
    mmsi,
    vesselId: vesselId(mmsi),
    baselineYear: ctx.baselineYear,
    baselineSource: ctx.baselineSource,
    targetYear: ctx.targetYear,
    ciiRequired: round(ctx.requiredTarget, 6),
    ciiAttained: round(ctx.attained, 6),
    ciiRatingBefore: ctx.ratingBefore,
    ciiGradeBefore: ctx.gradeBefore,
    measureCodes: combined.measures.map((measure) => measure.code),
    before: {
      attained: round(ctx.attained, 6),
      rating: round(ratingBefore, 8),
      grade: assignCiiGrade(ratingBefore, ctx.type.d),
    },
    after: {
      attained: round(combined.attained, 6),
      rating: round(ratingAfter, 8),
      grade: assignCiiGrade(ratingAfter, ctx.type.d),
    },
    reductionPercent: round((1 - combined.attained / ctx.attained) * 100, 4),
    fuelAfter: {
      meTon: round(combined.me, 3),
      aeTon: round(combined.ae, 3),
      conversionFactor: combined.cf,
    },
    yearsUntilInferior: yearsLeft,
    costUsdPerYear: Math.round(perYear(total.mean)),
    costRangeUsdPerYear: {
      low: Math.round(perYear(total.low)),
      high: Math.round(perYear(total.high)),
    },
    cost:
      total.low === total.high
        ? usd(perYear(total.mean))
        : `${usd(perYear(total.low))} - ${usd(perYear(total.high))}`,
    methodIds: [
      'seemp.simulation_combination',
      'seemp.cost_amortization',
      ...combined.measures.map((measure) => measure.methodId),
    ],
  };
}

function recommendations(mmsi, years) {
  const ctx = context(mmsi, years);
  const items = MEASURES.map((measure) => {
    const result = simulate(mmsi, [measure.code], years);
    return {
      recommendation: measure.name,
      cost: result.cost,
      ciiRatingAfter: round(result.after.rating, 8),
      ciiGradeAfter: result.after.grade,
      ciiRatingBefore: ctx.ratingBefore,
      ciiGradeBefore: ctx.gradeBefore,
      code: measure.code,
      costUsdPerYear: result.costUsdPerYear,
      costRangeUsdPerYear: result.costRangeUsdPerYear,
      ciiAttainedAfter: result.after.attained,
      yearsUntilInferior: result.yearsUntilInferior,
      methodIds: [measure.methodId, 'seemp.filter_sort_output', 'seemp.cost_amortization'],
    };
  })
    .filter((item) => ['A', 'B', 'C'].includes(item.ciiGradeAfter))
    .sort((a, b) => a.costUsdPerYear - b.costUsdPerYear);
  return {
    mmsi,
    vesselId: vesselId(mmsi),
    baselineYear: ctx.baselineYear,
    baselineSource: ctx.baselineSource,
    targetYear: ctx.targetYear,
    ciiRequired: round(ctx.requiredTarget, 6),
    ciiAttained: round(ctx.attained, 6),
    ciiRatingBefore: ctx.ratingBefore,
    ciiGradeBefore: ctx.gradeBefore,
    recommendations: items,
    methodIds: [
      'seemp.filter_sort_output',
      'seemp.cost_amortization',
      'cii.required',
      'cii.rating_grade',
    ],
  };
}

function yearsOf(input) {
  const years = {};
  for (const key of ['year', 'targetYear']) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
        errors: [{ field: key, message: `${key} must be an integer between 2000 and 2200` }],
      });
    }
    years[key] = year;
  }
  return years;
}

function codesOf(input) {
  const codes = input.measureCodes;
  if (!Array.isArray(codes) || codes.length < 1 || codes.length > 12) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'measureCodes', message: 'measureCodes must hold 1 to 12 codes' }],
    });
  }
  return codes;
}

const visibleTo = (claims) =>
  (claims?.roles ?? []).includes('super_admin') || claims?.org === FLEET_ORG_ID;

// --- routes -------------------------------------------------------------------------------

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/seemp/measures',
    permission: 'seemp:read',
    handler: ({ send }) => send(200, { data: MEASURES }),
  },
  {
    method: 'GET',
    path: '/api/v2/seemp/vessels/:mmsi/recommendations',
    permission: 'seemp:read',
    handler: ({ params, url, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      send(200, recommendations(mmsi, yearsOf(Object.fromEntries(url.searchParams))));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/seemp/vessels/:mmsi/simulate',
    permission: 'seemp:simulate',
    handler: async ({ params, claims, body, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const input = await body();
      send(200, simulate(mmsi, codesOf(input), yearsOf(input)));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/seemp/scenarios',
    permission: 'seemp:read',
    handler: ({ url, claims, send }) => {
      const mmsi = url.searchParams.get('mmsi');
      const items = visibleTo(claims)
        ? scenarios
            .filter((scenario) => !mmsi || String(scenario.mmsi) === mmsi)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];
      send(200, pageOf(items, url));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/seemp/scenarios',
    permission: 'seemp:simulate',
    handler: async ({ claims, body, send }) => {
      const input = await body();
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 120) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'name', message: 'name must have 1 to 120 characters' }],
        });
      }
      const [mmsi] = resolveVessel({ mmsi: String(input.mmsi ?? '') }, claims);
      const result = simulate(mmsi, codesOf(input), yearsOf(input));
      const scenario = {
        id: randomUUID(),
        mmsi,
        vesselId: vesselId(mmsi),
        name,
        measureCodes: result.measureCodes,
        baselineYear: result.baselineYear,
        targetYear: result.targetYear,
        result,
        createdBy: claims?.sub ?? USERS[1].id,
        createdAt: nowIso(),
      };
      scenarios = [scenario, ...scenarios];
      send(201, scenario);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/seemp/scenarios/:id',
    permission: 'seemp:read',
    handler: ({ params, claims, send }) => {
      const scenario = scenarios.find((item) => item.id === params.id);
      if (!scenario || !visibleTo(claims)) {
        throw new MockHttpError(404, 'SEEMP_SCENARIO_NOT_FOUND', 'Scenario not found');
      }
      send(200, scenario);
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/seemp/scenarios/:id',
    permission: 'seemp:simulate',
    handler: ({ params, claims, send }) => {
      const scenario = scenarios.find((item) => item.id === params.id);
      if (!scenario || !visibleTo(claims)) {
        throw new MockHttpError(404, 'SEEMP_SCENARIO_NOT_FOUND', 'Scenario not found');
      }
      scenarios = scenarios.filter((item) => item.id !== params.id);
      send(204);
    },
  },
];

seed();
