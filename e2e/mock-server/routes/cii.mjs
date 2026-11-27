// Emission service (spec §13.5, services/emission/README.md): CII of the demo fleet, daily
// curve, annual history with manual records, voyage segments, DCS summary, reduction factors and
// recomputation jobs. Deterministic data around "now"; shapes follow the emission openapi.json.
import { randomUUID } from 'node:crypto';

import { assignCiiGrade, ciiGradeBoundaries } from '@darmawanweb/ais-its-contracts/domain';

import {
  cursorPageOf,
  FLEET_ORG_ID,
  MockHttpError,
  nowIso,
  pageOf,
  vesselId,
  VESSELS,
} from '../lib.mjs';

// --- reference data -----------------------------------------------------------------------

const INITIAL_FACTORS = [
  [2023, 5, 'IMO MEPC.338(76) (G3)'],
  [2024, 7, 'IMO MEPC.338(76) (G3)'],
  [2025, 9, 'IMO MEPC.338(76) (G3)'],
  [2026, 11, 'IMO MEPC.338(76) (G3)'],
  [2027, 13.625, 'IMO MEPC.400(83)'],
  [2028, 16.25, 'IMO MEPC.400(83)'],
  [2029, 18.875, 'IMO MEPC.400(83)'],
  [2030, 21.5, 'IMO MEPC.400(83)'],
].map(([year, zPercent, source]) => ({ year, zPercent, source }));

/** Reference lines (MEPC.353(78)) and rating vectors (MEPC.354(78)) of the demo ship types. */
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

/**
 * CII profile per demo vessel: capacity (DWT or GT), rating per year, years that come from a
 * manual / imported record, nautical miles per sea day, service speed and the fuel method.
 * TB Pelita 5 (type unknown) has no CII; MV Combi Tanjung only legacy manual years.
 */
const PROFILES = {
  525005223: {
    capacity: 45_000,
    ratings: { 2023: 1.02, 2024: 0.99, 2025: 0.97, 2026: 0.95 },
    manual: [2023],
    nm: 230,
    speed: 11.5,
    method: 'holtrop',
  },
  525019001: {
    capacity: 3_000,
    ratings: { 2023: 0.97, 2024: 0.93, 2025: 0.89, 2026: 0.85 },
    manual: [],
    nm: 260,
    speed: 18,
    method: 'first_formula',
  },
  525019002: {
    capacity: 30_000,
    ratings: { 2023: 1.02, 2024: 1.06, 2025: 1.09, 2026: 1.15 },
    manual: [],
    nm: 210,
    speed: 11,
    method: 'holtrop',
  },
  525019003: {
    capacity: 8_000,
    ratings: { 2023: 0.88, 2024: 0.86, 2025: 0.83, 2026: 0.8 },
    manual: [2023],
    nm: 170,
    speed: 9,
    method: 'telemetry',
  },
  563012345: {
    capacity: 50_000,
    ratings: { 2023: 0.95, 2024: 0.94, 2025: 0.92, 2026: 0.9 },
    manual: [],
    nm: 330,
    speed: 15,
    method: 'telemetry',
  },
  563045678: {
    capacity: 9_000,
    ratings: { 2023: 0.96, 2024: 0.97, 2025: 0.99, 2026: 1.0 },
    manual: [],
    nm: 280,
    speed: 13,
    method: 'holtrop',
  },
  538007788: {
    capacity: 60_000,
    ratings: { 2023: 1.1, 2024: 1.14, 2025: 1.19, 2026: 1.25 },
    manual: [],
    nm: 240,
    speed: 11.5,
    method: 'holtrop',
  },
  525019005: {
    capacity: 80_000,
    ratings: { 2023: 0.9, 2024: 0.89, 2025: 0.87, 2026: 0.86 },
    manual: [],
    nm: 300,
    speed: 14,
    method: 'telemetry',
  },
  636019900: {
    capacity: 50_000,
    ratings: { 2023: 1.0, 2024: 1.03, 2025: 1.06, 2026: 1.1 },
    manual: [],
    nm: 340,
    speed: 16,
    method: 'first_formula',
  },
  525019006: {
    capacity: 2_500,
    ratings: { 2024: 1.01, 2025: 0.98, 2026: 0.95 },
    manual: [],
    nm: 220,
    speed: 16,
    method: 'first_formula',
  },
  525019007: {
    capacity: 20_000,
    ratings: { 2023: 0.97, 2024: 0.95, 2025: 0.93, 2026: 0.92 },
    manual: [2023],
    nm: 200,
    speed: 10,
    method: 'holtrop',
  },
  525019008: {
    capacity: 60_000,
    ratings: { 2023: 1.06, 2024: 1.05, 2025: 1.04, 2026: 1.02 },
    manual: [],
    nm: 290,
    speed: 17,
    method: 'first_formula',
  },
  525019009: {
    capacity: 40_000,
    ratings: { 2023: 1.08, 2024: 1.05 },
    manual: [2023, 2024],
    nm: 220,
    speed: 10,
    method: 'holtrop',
  },
};

const FUELS = {
  HFO: { name: 'Heavy fuel oil (HFO)', cf: 3.114 },
  MDO: { name: 'Marine diesel oil (MDO)', cf: 3.206 },
};
const ME_SHARE = 0.86;

const CURRENT_IDS = [
  'cii.attained_accumulation',
  'cii.reference_line',
  'cii.required',
  'cii.reduction_factor_z',
  'cii.rating_grade',
  'cii.dd_vector_boundaries',
  'cii.year_end_projection',
  'fuel.method_selection',
  'emission.co2_conversion',
];

// --- state --------------------------------------------------------------------------------

let factors = structuredClone(INITIAL_FACTORS);
/** Manual records by `${mmsi}:${year}` (AnnualManualDto). */
let manual = new Map();
/** Recomputation jobs by id. */
let jobs = new Map();

export function reset() {
  factors = structuredClone(INITIAL_FACTORS);
  manual = new Map();
  jobs = new Map();
}

// --- helpers ------------------------------------------------------------------------------

const DAY = 86_400_000;
const round = (value, digits = 6) => Number(value.toFixed(digits));

/** Deterministic pseudo random numbers (mulberry32). */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const vesselOf = (mmsi) => VESSELS.find(([value]) => value === mmsi);

/** The demo vessel of `:mmsi` with tenancy (spec §8.5): own organization or super_admin. */
function resolveVessel(params, claims) {
  if (!/^\d{9}$/.test(params.mmsi ?? '')) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'mmsi', message: 'mmsi must be 9 digits' }],
    });
  }
  const mmsi = Number(params.mmsi);
  const vessel = vesselOf(mmsi);
  if (!vessel) {
    throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found', {
      detail: `No vessel with MMSI ${mmsi}`,
    });
  }
  const roles = claims?.roles ?? [];
  if (!roles.includes('super_admin') && claims?.org !== FLEET_ORG_ID) {
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden', {
      detail: 'The vessel belongs to another organization',
    });
  }
  return vessel;
}

const factorOf = (year) => factors.find((factor) => factor.year === year) ?? null;
const thisYear = () => new Date().getUTCFullYear();

function yearFraction(year, at = new Date()) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return Math.min(1, Math.max(1 / 365, (at.getTime() - start) / (end - start)));
}

function parseYear(url, key = 'year') {
  const raw = url.searchParams.get(key);
  if (raw === null) return thisYear();
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: key, message: 'year must be an integer between 2000 and 2200' }],
    });
  }
  return year;
}

function methodCounts(method, segments) {
  if (!segments) return { telemetry: 0, firstFormula: 0, holtrop: 0 };
  const main = Math.round(segments * 0.82);
  const rest = segments - main;
  return {
    telemetry: method === 'telemetry' ? main : Math.round(rest * 0.3),
    firstFormula: method === 'first_formula' ? main : Math.round(rest * 0.3),
    holtrop: method === 'holtrop' ? main : rest - 2 * Math.round(rest * 0.3),
  };
}

/** Rated CII figures of a vessel-year (segments or manual record), or null without data. */
function yearFigures(mmsi, year) {
  const vessel = vesselOf(mmsi);
  const profile = PROFILES[mmsi];
  const type = vessel ? TYPES[vessel[2]] : undefined;
  const record = manual.get(`${mmsi}:${year}`);
  const hasSegments =
    !!profile && profile.ratings[year] !== undefined && !profile.manual.includes(year);
  if (!profile || !type) return null;
  if (!hasSegments && !record && profile.ratings[year] === undefined) return null;

  const factor = factorOf(year);
  const reference = type.a * profile.capacity ** -type.c;
  const required = factor ? (1 - factor.zPercent / 100) * reference : null;
  const source = hasSegments ? 'segments' : 'manual';
  const fraction = year === thisYear() ? yearFraction(year) : 1;

  let attained;
  let distanceNm;
  let fuelMeTon;
  let fuelAeTon;
  let co2Ton;
  if (source === 'manual' && record) {
    ({ attained, distanceNm, fuelMeTon, fuelAeTon } = record);
    co2Ton = record.co2Ton ?? fuelMeTon * FUELS.HFO.cf + fuelAeTon * FUELS.MDO.cf;
  } else {
    if (!required) {
      throw new MockHttpError(422, 'REDUCTION_FACTOR_MISSING', 'Reduction factor missing', {
        detail: `No reduction factor for ${year}`,
      });
    }
    attained = profile.ratings[year] * required;
    distanceNm = profile.nm * 365 * 0.7 * fraction;
    co2Ton = (attained * profile.capacity * distanceNm) / 1e6;
    fuelMeTon = (co2Ton * ME_SHARE) / FUELS.HFO.cf;
    fuelAeTon = (co2Ton * (1 - ME_SHARE)) / FUELS.MDO.cf;
  }
  const requiredValue = source === 'manual' && record?.required ? record.required : required;
  const rating =
    source === 'manual' && record?.rating
      ? record.rating
      : requiredValue
        ? attained / requiredValue
        : null;
  const grade =
    source === 'manual' && record?.grade
      ? record.grade
      : rating !== null
        ? assignCiiGrade(rating, type.d)
        : null;
  const segments = source === 'segments' ? Math.round(distanceNm / (profile.speed * 0.5)) : null;
  return {
    year,
    source,
    distanceNm: round(distanceNm, 3),
    fuelMeTon: round(fuelMeTon, 4),
    fuelAeTon: round(fuelAeTon, 4),
    co2Ton: round(co2Ton, 4),
    segments,
    methods: source === 'segments' ? methodCounts(profile.method, segments) : null,
    asOf:
      source === 'segments'
        ? year === thisYear()
          ? new Date(Date.now() - 600_000).toISOString()
          : `${year}-12-31T23:30:00.000Z`
        : null,
    zPercent: factor?.zPercent ?? null,
    attained: round(attained, 6),
    required: requiredValue === null ? null : round(requiredValue, 6),
    rating: rating === null ? null : round(rating, 6),
    grade,
    ddVector: requiredValue ? ciiGradeBoundaries(requiredValue, type.d) : null,
    methodIds:
      source === 'manual'
        ? ['cii.annual_manual', 'cii.required', 'cii.rating_grade', 'cii.dd_vector_boundaries']
        : CURRENT_IDS.filter((id) => id !== 'cii.year_end_projection'),
  };
}

function currentOf(mmsi, year) {
  const figures = yearFigures(mmsi, year);
  if (!figures) {
    throw new MockHttpError(404, 'CII_NOT_AVAILABLE', 'CII not available', {
      detail: `No CII data for MMSI ${mmsi} in ${year}`,
    });
  }
  const profile = PROFILES[mmsi];
  const current = year === thisYear() && figures.source === 'segments';
  const fraction = yearFraction(year);
  return {
    ...figures,
    methodIds: current ? CURRENT_IDS : figures.methodIds,
    mmsi,
    vesselId: vesselId(mmsi),
    capacity: profile.capacity,
    lastMethod: figures.source === 'segments' ? profile.method : null,
    projection: current
      ? {
          yearFraction: round(fraction, 6),
          distanceNm: round(figures.distanceNm / fraction, 3),
          fuelMeTon: round(figures.fuelMeTon / fraction, 4),
          fuelAeTon: round(figures.fuelAeTon / fraction, 4),
          co2Ton: round(figures.co2Ton / fraction, 4),
          attained: figures.attained,
          rating: figures.rating,
          grade: figures.grade,
        }
      : null,
  };
}

/** Daily points of a year up to today, scaled so the year-to-date total equals the figures. */
function dailySeries(mmsi, year) {
  const figures = yearFigures(mmsi, year);
  const profile = PROFILES[mmsi];
  const type = TYPES[vesselOf(mmsi)[2]];
  if (!figures || figures.source !== 'segments') return [];
  const start = Date.UTC(year, 0, 1);
  const end = Math.min(Date.UTC(year + 1, 0, 1), Date.now());
  const days = Math.max(1, Math.ceil((end - start) / DAY));
  const rand = random(mmsi + year);
  const raw = [];
  for (let index = 0; index < days; index += 1) {
    const atSea = rand() > 0.16;
    const distance = atSea ? profile.nm * (0.45 + 0.8 * rand()) : 0;
    const intensity =
      1 +
      0.32 * (rand() - 0.5) +
      0.14 * Math.sin(index / 38) +
      (index < 40 ? 0.18 * (1 - index / 40) : 0);
    raw.push({ distance, co2: (distance * profile.capacity * intensity) / 1e6 });
  }
  const distanceSum = raw.reduce((sum, item) => sum + item.distance, 0) || 1;
  const co2Sum = raw.reduce((sum, item) => sum + item.co2, 0) || 1;
  const distanceScale = figures.distanceNm / distanceSum;
  const co2Scale = figures.co2Ton / co2Sum;
  let distanceTotal = 0;
  let co2Total = 0;
  return raw.map((item, index) => {
    const distanceNm = item.distance * distanceScale;
    const co2Ton = item.co2 * co2Scale;
    distanceTotal += distanceNm;
    co2Total += co2Ton;
    const attained = distanceNm > 0 ? (co2Ton * 1e6) / (profile.capacity * distanceNm) : null;
    const cumulative =
      distanceTotal > 0 ? (co2Total * 1e6) / (profile.capacity * distanceTotal) : null;
    const rating = cumulative !== null && figures.required ? cumulative / figures.required : null;
    const segments = distanceNm > 0 ? Math.round(distanceNm / (profile.speed * 0.5)) : 0;
    return {
      day: new Date(start + index * DAY).toISOString().slice(0, 10),
      distanceNm: round(distanceNm, 3),
      fuelMeTon: round((co2Ton * ME_SHARE) / FUELS.HFO.cf, 4),
      fuelAeTon: round((co2Ton * (1 - ME_SHARE)) / FUELS.MDO.cf, 4),
      co2Ton: round(co2Ton, 4),
      segments,
      methods: methodCounts(profile.method, segments),
      attained: attained === null ? null : round(attained, 6),
      cumulativeAttained: cumulative === null ? null : round(cumulative, 6),
      required: figures.required,
      cumulativeRating: rating === null ? null : round(rating, 6),
      cumulativeGrade: rating === null ? null : assignCiiGrade(rating, type.d),
    };
  });
}

function parseTime(url, key, fallback) {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: key, message: `${key} must be an ISO-8601 date-time` }],
    });
  }
  return time;
}

const beaufort = (kn) =>
  [1, 4, 7, 11, 17, 22, 28, 34].findIndex((limit) => kn < limit) === -1
    ? 8
    : [1, 4, 7, 11, 17, 22, 28, 34].findIndex((limit) => kn < limit);

/** Segments of a vessel in [from, to), newest first, one every 30 minutes. */
function segmentsOf(mmsi, from, to) {
  const profile = PROFILES[mmsi];
  const vessel = vesselOf(mmsi);
  if (!profile) return [];
  const step = 30 * 60_000;
  const items = [];
  for (
    let end = Math.floor(to / step) * step;
    end - step >= from && items.length < 1_600;
    end -= step
  ) {
    const rand = random(mmsi + end / step);
    const slot = Math.floor(end / step);
    const inPort = slot % 48 >= 40;
    const speedKn = inPort
      ? round(rand() * 0.4, 2)
      : round(profile.speed * (0.78 + 0.3 * rand()), 2);
    const distanceNm = round(speedKn * 0.5, 4);
    let method = profile.method;
    const flags = [];
    if (slot % 97 === 0) {
      method = 'none';
      flags.push('no_fuel_model');
    } else if (method === 'holtrop' && slot % 31 === 0) {
      flags.push('weather_unavailable');
    } else if (method === 'telemetry' && slot % 23 === 0) {
      flags.push('telemetry_reattributed');
    }
    const fuelMeTon =
      method === 'none'
        ? 0
        : round((distanceNm * profile.capacity * 0.0000009 + 0.04) * (0.9 + 0.2 * rand()), 5);
    const fuelAeTon = method === 'none' ? 0 : round(0.012 + 0.006 * rand(), 5);
    const weather =
      method === 'holtrop'
        ? flags.includes('weather_unavailable')
          ? {
              windSpeedKn: 0,
              windDirectionDeg: 0,
              beaufortNumber: 0,
              encounterAngleDeg: 0,
              source: 'calm_fallback',
              hour: new Date(Math.floor((end - step) / 3_600_000) * 3_600_000).toISOString(),
              cellLat: round(Math.round(vessel[3] * 4) / 4, 2),
              cellLon: round(Math.round(vessel[4] * 4) / 4, 2),
            }
          : (() => {
              const wind = round(6 + 16 * rand(), 1);
              return {
                windSpeedKn: wind,
                windDirectionDeg: Math.round(360 * rand()),
                beaufortNumber: beaufort(wind),
                encounterAngleDeg: Math.round(180 * rand()),
                source: 'open-meteo',
                hour: new Date(Math.floor((end - step) / 3_600_000) * 3_600_000).toISOString(),
                cellLat: round(Math.round(vessel[3] * 4) / 4, 2),
                cellLon: round(Math.round(vessel[4] * 4) / 4, 2),
              };
            })()
        : null;
    items.push({
      timeStart: new Date(end - step).toISOString(),
      timeEnd: new Date(end).toISOString(),
      mmsi,
      vesselId: vesselId(mmsi),
      distanceNm,
      speedKn,
      fuelMeTon,
      fuelAeTon,
      co2Ton: round(fuelMeTon * FUELS.HFO.cf + fuelAeTon * FUELS.MDO.cf, 5),
      method,
      navstatus: inPort ? 5 : 0,
      fuelCode: 'HFO',
      conversionFactor: FUELS.HFO.cf,
      weather,
      flags,
    });
  }
  return items;
}

function dcsOf(mmsi, year) {
  const figures = yearFigures(mmsi, year);
  const vessel = vesselOf(mmsi);
  if (!figures) {
    throw new MockHttpError(404, 'CII_NOT_AVAILABLE', 'CII not available', {
      detail: `No emission data for MMSI ${mmsi} in ${year}`,
    });
  }
  const profile = PROFILES[mmsi];
  const hfo = round(figures.fuelMeTon, 3);
  const mdo = round(figures.fuelAeTon, 3);
  return {
    year,
    mmsi,
    vesselId: vesselId(mmsi),
    imo: mmsi === 525005223 ? '9123456' : null,
    vesselName: vessel[1],
    source: figures.source,
    fuel: [
      {
        fuelCode: 'HFO',
        fuelName: FUELS.HFO.name,
        conversionFactor: FUELS.HFO.cf,
        fuelMeTon: hfo,
        fuelAeTon: 0,
        totalTon: hfo,
        co2Ton: round(hfo * FUELS.HFO.cf, 3),
      },
      {
        fuelCode: 'MDO',
        fuelName: FUELS.MDO.name,
        conversionFactor: FUELS.MDO.cf,
        fuelMeTon: 0,
        fuelAeTon: mdo,
        totalTon: mdo,
        co2Ton: round(mdo * FUELS.MDO.cf, 3),
      },
    ],
    distanceNm: figures.distanceNm,
    hoursUnderWay:
      figures.source === 'segments' ? round(figures.distanceNm / profile.speed, 1) : null,
    co2Ton: round(hfo * FUELS.HFO.cf + mdo * FUELS.MDO.cf, 3),
    methodIds: ['emission.dcs_summary', 'emission.co2_conversion', 'fuel.method_selection'],
  };
}

function toCsv(dcs) {
  const lines = [
    [
      'year',
      'mmsi',
      'imo',
      'vessel_name',
      'source',
      'fuel_code',
      'fuel_name',
      'conversion_factor',
      'fuel_me_t',
      'fuel_ae_t',
      'fuel_total_t',
      'co2_t',
      'distance_nm',
      'hours_under_way',
    ],
    ...dcs.fuel.map((line) => [
      dcs.year,
      dcs.mmsi,
      dcs.imo ?? '',
      dcs.vesselName,
      dcs.source,
      line.fuelCode,
      line.fuelName,
      line.conversionFactor,
      line.fuelMeTon,
      line.fuelAeTon,
      line.totalTon,
      line.co2Ton,
      dcs.distanceNm,
      dcs.hoursUnderWay ?? '',
    ]),
  ];
  return lines
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
}

function fleetItems() {
  return [...VESSELS].sort((a, b) => a[0] - b[0]);
}

function isSuperAdmin(claims) {
  return (claims?.roles ?? []).includes('super_admin');
}

function jobView(job) {
  const elapsed = Date.now() - Date.parse(job.createdAt);
  const done = elapsed > 1_500;
  return {
    ...job,
    status: done ? 'succeeded' : 'running',
    replayed: done ? job.expected * 2 : Math.round(job.expected * Math.min(1, elapsed / 1_500)),
    segments: done ? job.expected : 0,
    deleted: done ? 2 : 0,
    heartbeatAt: new Date(Math.min(Date.now(), Date.parse(job.createdAt) + 1_500)).toISOString(),
    finishedAt: done ? new Date(Date.parse(job.createdAt) + 1_500).toISOString() : null,
    expected: undefined,
  };
}

function number(value, field, { min = 0, positive = false, optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field, message: `${field} is required` }],
    });
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    (positive && value <= 0)
  ) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [
        { field, message: `${field} must be a ${positive ? 'positive' : 'non-negative'} number` },
      ],
    });
  }
  return value;
}

// --- routes -------------------------------------------------------------------------------

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/cii/fleet/fuel',
    permission: 'cii:read',
    handler: ({ url, claims, send }) => {
      const year = parseYear(url);
      const now = new Date();
      const month = Number(url.searchParams.get('month') ?? now.getUTCMonth() + 1);
      const admin = isSuperAdmin(claims);
      const orgId = admin ? url.searchParams.get('orgId') : (claims?.org ?? null);
      const vessels = !orgId || orgId === FLEET_ORG_ID ? fleetItems() : [];
      const period = (from, to) => {
        const totals = { fuelMeTon: 0, fuelAeTon: 0, co2Ton: 0, vesselsWithData: 0 };
        for (const [mmsi] of vessels) {
          const points = dailySeries(mmsi, year).filter((point) => {
            const day = Date.parse(point.day);
            return day >= from && day < to;
          });
          if (points.length === 0) continue;
          totals.vesselsWithData += 1;
          for (const point of points) {
            totals.fuelMeTon += point.fuelMeTon;
            totals.fuelAeTon += point.fuelAeTon;
            totals.co2Ton += point.co2Ton;
          }
        }
        return {
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          fuelMeTon: round(totals.fuelMeTon, 3),
          fuelAeTon: round(totals.fuelAeTon, 3),
          totalFuelTon: round(totals.fuelMeTon + totals.fuelAeTon, 3),
          co2Ton: round(totals.co2Ton, 3),
          vesselsWithData: totals.vesselsWithData,
          manualVessels: 0,
          methods: { telemetry: 0, firstFormula: totals.vesselsWithData, holtrop: 0 },
        };
      };
      send(200, {
        orgId: admin ? (url.searchParams.get('orgId') ?? null) : (claims?.org ?? null),
        vessels: vessels.length,
        year: period(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)),
        month: period(Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)),
        methodIds: ['fuel.method_selection', 'cii.attained_accumulation'],
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/fleet/summary',
    permission: 'cii:read',
    handler: ({ url, claims, send }) => {
      const year = parseYear(url);
      const orgId = url.searchParams.get('orgId');
      const admin = isSuperAdmin(claims);
      const scope = admin ? orgId : claims?.org;
      const vessels = !scope || scope === FLEET_ORG_ID ? fleetItems() : [];
      const items = vessels.map(([mmsi, name]) => {
        const figures = yearFigures(mmsi, year);
        return {
          mmsi,
          vesselId: vesselId(mmsi),
          name,
          grade: figures?.grade ?? null,
          rating: figures?.rating ?? null,
          attained: figures?.attained ?? null,
          source: figures?.source ?? null,
        };
      });
      const grades = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      for (const item of items) if (item.grade) grades[item.grade] += 1;
      const page = pageOf(items, url);
      send(200, {
        year,
        orgId: admin ? (orgId ?? null) : (claims?.org ?? null),
        vessels: items.length,
        grades,
        notAvailable: items.filter((item) => !item.grade).length,
        items: page.data,
        meta: page.meta,
        methodIds: ['cii.attained_accumulation', 'cii.required', 'cii.rating_grade'],
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/vessels/:mmsi/current',
    permission: 'cii:read',
    handler: ({ params, url, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      send(200, currentOf(mmsi, parseYear(url)));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/vessels/:mmsi/daily',
    permission: 'cii:read',
    handler: ({ params, url, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const to = parseTime(url, 'to', Date.now());
      const year = new Date(to).getUTCFullYear();
      const from = parseTime(url, 'from', Date.UTC(year, 0, 1));
      const points = dailySeries(mmsi, new Date(from).getUTCFullYear()).filter((point) => {
        const time = Date.parse(point.day);
        return time >= from - DAY + 1 && time < to;
      });
      send(200, {
        mmsi,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        points,
        methodIds: ['cii.attained_accumulation', 'cii.rating_grade', 'cii.dd_vector_boundaries'],
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/vessels/:mmsi/annual',
    permission: 'cii:read',
    handler: ({ params, claims, send }) => {
      const [mmsi, , typeCode] = resolveVessel(params, claims);
      const years = [];
      for (let year = 2019; year <= thisYear(); year += 1) {
        const figures = yearFigures(mmsi, year);
        if (figures) years.push(figures);
      }
      if (years.length === 0) {
        throw new MockHttpError(404, 'CII_NOT_AVAILABLE', 'CII not available', {
          detail: `No CII data for MMSI ${mmsi}`,
        });
      }
      send(200, { mmsi, vesselId: vesselId(mmsi), dVector: TYPES[typeCode].d, years });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/vessels/:mmsi/segments',
    permission: 'cii:read',
    handler: ({ params, url, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const to = parseTime(url, 'to', Date.now());
      const from = parseTime(url, 'from', to - DAY);
      if (from >= to || to - from > 31 * DAY) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'from', message: 'The range must be positive and at most 31 days' }],
        });
      }
      send(200, cursorPageOf(segmentsOf(mmsi, from, to), url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/vessels/:mmsi/annual-manual/:year',
    permission: 'vessel:write',
    handler: ({ params, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const record = manual.get(`${mmsi}:${Number(params.year)}`);
      if (!record) {
        throw new MockHttpError(404, 'CII_ANNUAL_MANUAL_NOT_FOUND', 'Manual annual CII not found');
      }
      send(200, record);
    },
  },
  {
    method: 'PUT',
    path: '/api/v2/cii/vessels/:mmsi/annual-manual/:year',
    permission: 'vessel:write',
    handler: async ({ params, claims, body, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const year = Number(params.year);
      if (!Number.isInteger(year) || year < 2000 || year > thisYear()) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'year', message: 'year must be between 2000 and the current year' }],
        });
      }
      const input = await body();
      const grade = input.grade ?? null;
      if (grade !== null && !['A', 'B', 'C', 'D', 'E'].includes(grade)) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'grade', message: 'grade must be one of A, B, C, D, E' }],
        });
      }
      const record = {
        vesselId: vesselId(mmsi),
        mmsi,
        year,
        attained: number(input.attained, 'attained', { positive: true }),
        required: number(input.required, 'required', { positive: true, optional: true }) ?? null,
        rating: number(input.rating, 'rating', { positive: true, optional: true }) ?? null,
        grade,
        distanceNm: number(input.distanceNm, 'distanceNm'),
        fuelMeTon: number(input.fuelMeTon, 'fuelMeTon'),
        fuelAeTon: number(input.fuelAeTon, 'fuelAeTon'),
        co2Ton: number(input.co2Ton, 'co2Ton', { optional: true }) ?? null,
        note: typeof input.note === 'string' ? input.note.slice(0, 2000) : null,
        updatedBy: claims?.sub ?? null,
        updatedAt: nowIso(),
      };
      manual.set(`${mmsi}:${year}`, record);
      send(200, record);
    },
  },
  {
    method: 'POST',
    path: '/api/v2/cii/vessels/:mmsi/recompute',
    permission: 'cii:read',
    handler: ({ params, url, claims, send }) => {
      if (!isSuperAdmin(claims)) {
        throw new MockHttpError(403, 'SUPER_ADMIN_REQUIRED', 'Platform administrator required');
      }
      const [mmsi] = resolveVessel(params, claims);
      const to = parseTime(url, 'to', Date.now());
      const from = parseTime(url, 'from', to - DAY);
      if (
        from >= to ||
        to > Date.now() + 60_000 ||
        to - from > 7 * DAY ||
        Date.now() - from > 7 * DAY + 60_000
      ) {
        throw new MockHttpError(400, 'RECOMPUTE_RANGE_INVALID', 'Invalid recomputation range', {
          detail:
            'The range must be at most 7 days, inside the stream window and end no later than now',
        });
      }
      const running = [...jobs.values()].find(
        (job) => job.mmsi === mmsi && Date.now() - Date.parse(job.createdAt) <= 1_500,
      );
      if (running) {
        throw new MockHttpError(409, 'RECOMPUTE_IN_PROGRESS', 'A recomputation is running', {
          detail: `Job ${running.id} is still running`,
        });
      }
      const job = {
        id: randomUUID(),
        mmsi,
        vesselId: vesselId(mmsi),
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        status: 'running',
        replayed: 0,
        segments: 0,
        deleted: 0,
        error: null,
        createdAt: nowIso(),
        heartbeatAt: nowIso(),
        finishedAt: null,
        expected: Math.max(1, Math.round((to - from) / (30 * 60_000))),
      };
      jobs.set(job.id, job);
      send(202, jobView(job));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/cii/recompute-jobs/:id',
    permission: 'cii:read',
    handler: ({ params, claims, send }) => {
      if (!isSuperAdmin(claims)) {
        throw new MockHttpError(403, 'SUPER_ADMIN_REQUIRED', 'Platform administrator required');
      }
      const job = jobs.get(params.id);
      if (!job)
        throw new MockHttpError(404, 'RECOMPUTE_JOB_NOT_FOUND', 'Recomputation job not found');
      send(200, jobView(job));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/reduction-factors',
    permission: 'cii:read',
    handler: ({ send }) => send(200, { data: [...factors].sort((a, b) => a.year - b.year) }),
  },
  {
    method: 'PUT',
    path: '/api/v2/reduction-factors',
    permission: 'reference:write',
    handler: async ({ body, send }) => {
      const input = await body();
      const items = Array.isArray(input.items) ? input.items : null;
      if (!items || items.length === 0) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'items', message: 'items must be a non-empty array' }],
        });
      }
      items.forEach((item, index) => {
        if (!Number.isInteger(item.year) || item.year < 2019 || item.year > 2100) {
          throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
            errors: [
              { field: `items.${index}.year`, message: 'year must be between 2019 and 2100' },
            ],
          });
        }
        number(item.zPercent, `items.${index}.zPercent`);
        if (typeof item.source !== 'string' || !item.source.trim()) {
          throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
            errors: [{ field: `items.${index}.source`, message: 'source is required' }],
          });
        }
      });
      for (const item of items) {
        factors = [
          ...factors.filter((factor) => factor.year !== item.year),
          { year: item.year, zPercent: item.zPercent, source: item.source.trim() },
        ];
      }
      send(200, { data: [...factors].sort((a, b) => a.year - b.year) });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/emission/vessels/:mmsi/dcs',
    permission: 'cii:read',
    handler: ({ req, params, url, claims, send }) => {
      const [mmsi] = resolveVessel(params, claims);
      const dcs = dcsOf(mmsi, parseYear(url));
      // The mock gateway answers JSON bodies only: CSV downloads are fulfilled by the e2e spec
      // (page.route); the mock still marks what the service would send.
      if ((req.headers.accept ?? '').includes('text/csv')) {
        return send(200, toCsv(dcs), { 'Content-Type': 'text/csv; charset=utf-8' });
      }
      send(200, dcs);
    },
  },
];
