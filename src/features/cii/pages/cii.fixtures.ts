import { http, HttpResponse } from 'msw';

import type {
  AnnualCiiDto,
  CiiSummaryDto,
  DailyCiiDto,
  DcsSummaryDto,
  FleetSummaryDto,
  ReductionFactorListDto,
  SegmentDto,
} from '@/shared/api/generated/emission/model';
import type { VesselSummaryDto } from '@/shared/api/generated/fleet/model';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

/** Typed fixtures of the emission service (a contract change fails the typecheck). */
export const YEAR = new Date().getUTCFullYear();
export const MMSI = 525005223;
export const DD = { d1: 5.55, d2: 6.3, d3: 7.32, d4: 8.67 };

export const FLEET: FleetSummaryDto = {
  year: YEAR,
  orgId: TEST_IDS.orgA,
  vessels: 3,
  grades: { A: 0, B: 1, C: 1, D: 0, E: 0 },
  notAvailable: 1,
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
      mmsi: 525019001,
      vesselId: 'v2',
      name: 'MV Batam Express',
      grade: 'B',
      rating: 0.85,
      attained: 51.89,
      source: 'manual',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
    {
      mmsi: 525019004,
      vesselId: 'v3',
      name: 'TB Pelita 5',
      grade: null,
      rating: null,
      attained: null,
      source: null,
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
  ],
  meta: { page: 1, pageSize: 20, total: 3 },
  methodIds: ['cii.attained_accumulation', 'cii.rating_grade'],
};

export const EMPTY_FLEET: FleetSummaryDto = {
  ...FLEET,
  vessels: 0,
  grades: { A: 0, B: 0, C: 0, D: 0, E: 0 },
  notAvailable: 0,
  items: [],
  meta: { page: 1, pageSize: 20, total: 0 },
};

export const FACTORS: ReductionFactorListDto = {
  data: [
    { year: YEAR - 1, zPercent: 9, source: 'IMO MEPC.338(76) (G3)' },
    { year: YEAR, zPercent: 11, source: 'IMO MEPC.338(76) (G3)' },
    { year: YEAR + 1, zPercent: 13.625, source: 'IMO MEPC.400(83)' },
  ],
};

export const SUMMARY: CiiSummaryDto = {
  vessel: {
    vesselId: 'v1',
    mmsi: MMSI,
    imo: null,
    name: 'KM Bahari Nusantara',
    flag: 'ID',
    typeCode: 'bulk_carrier',
    typeName: 'Bulk carrier',
  },
  year: YEAR,
  source: 'segments',
  distanceNm: 52462.6,
  fuelMeTon: 4195.73,
  fuelAeTon: 663.43,
  co2Ton: 15192.44,
  segments: 9124,
  methods: { telemetry: 493, firstFormula: 493, holtrop: 7482 },
  asOf: new Date().toISOString(),
  zPercent: 11,
  attained: 6.44,
  required: 6.77,
  rating: 0.95,
  grade: 'C',
  ddVector: DD,
  methodIds: ['cii.attained_accumulation', 'cii.required', 'cii.rating_grade'],
  mmsi: MMSI,
  vesselId: 'v1',
  capacity: 45000,
  lastMethod: 'holtrop',
  projection: {
    yearFraction: 0.89,
    distanceNm: 58765,
    fuelMeTon: 4699.8,
    fuelAeTon: 743.1,
    co2Ton: 17017.5,
    attained: 6.44,
    rating: 0.95,
    grade: 'C',
  },
};

export const DAILY: DailyCiiDto = {
  mmsi: MMSI,
  from: `${YEAR}-01-01T00:00:00.000Z`,
  to: new Date().toISOString(),
  points: [1, 2, 3].map((day) => ({
    day: `${YEAR}-01-0${day}`,
    distanceNm: 300,
    fuelMeTon: 25,
    fuelAeTon: 4,
    co2Ton: 90,
    segments: 60,
    methods: { telemetry: 0, firstFormula: 0, holtrop: 60 },
    attained: 6.6,
    cumulativeAttained: 6.6 - day * 0.05,
    required: 6.77,
    cumulativeRating: (6.6 - day * 0.05) / 6.77,
    cumulativeGrade: 'C',
  })),
  methodIds: ['cii.attained_accumulation'],
};

export const ANNUAL: AnnualCiiDto = {
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
  years: [
    {
      year: YEAR - 1,
      source: 'manual',
      distanceNm: 50000,
      fuelMeTon: 3000,
      fuelAeTon: 400,
      co2Ton: 10600,
      segments: null,
      methods: null,
      asOf: null,
      zPercent: 9,
      attained: 7.1,
      required: 6.92,
      rating: 1.026,
      grade: 'C',
      ddVector: { d1: 5.67, d2: 6.44, d3: 7.47, d4: 8.86 },
      methodIds: ['cii.annual_manual'],
    },
    {
      year: YEAR,
      source: 'segments',
      distanceNm: SUMMARY.distanceNm,
      fuelMeTon: SUMMARY.fuelMeTon,
      fuelAeTon: SUMMARY.fuelAeTon,
      co2Ton: SUMMARY.co2Ton,
      segments: SUMMARY.segments,
      methods: SUMMARY.methods,
      asOf: SUMMARY.asOf,
      zPercent: SUMMARY.zPercent,
      attained: SUMMARY.attained,
      required: SUMMARY.required,
      rating: SUMMARY.rating,
      grade: 'C',
      ddVector: DD,
      methodIds: SUMMARY.methodIds,
    },
  ],
};

export const SEGMENT: SegmentDto = {
  timeStart: new Date(Date.now() - 20 * 60_000).toISOString(),
  timeEnd: new Date(Date.now() - 8 * 60_000).toISOString(),
  mmsi: MMSI,
  vesselId: 'v1',
  distanceNm: 2.5,
  speedKn: 12.5,
  fuelMeTon: 0.12,
  fuelAeTon: 0.02,
  co2Ton: 0.44,
  method: 'holtrop',
  navstatus: 0,
  fuelCode: 'HFO',
  conversionFactor: 3.114,
  weather: {
    windSpeedKn: 14.2,
    windDirectionDeg: 210,
    beaufortNumber: 4,
    encounterAngleDeg: 35,
    source: 'open-meteo',
    hour: new Date().toISOString(),
    cellLat: 1.25,
    cellLon: 103.75,
  },
  flags: [],
};

export const DCS: DcsSummaryDto = {
  year: YEAR,
  mmsi: MMSI,
  vesselId: 'v1',
  imo: '9040236',
  vesselName: 'KM Bahari Nusantara',
  source: 'segments',
  fuel: [
    {
      fuelCode: 'HFO',
      fuelName: 'Heavy fuel oil (HFO)',
      conversionFactor: 3.114,
      fuelMeTon: 4195.73,
      fuelAeTon: 663.43,
      totalTon: 4859.16,
      co2Ton: 15131.42,
    },
  ],
  distanceNm: 52462.6,
  hoursUnderWay: 4120.5,
  co2Ton: 15131.42,
  methodIds: ['emission.dcs_summary'],
};

export const VESSEL: VesselSummaryDto = {
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

export function problemResponse(status: number, code: string, title = code) {
  return HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, title, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** The emission + fleet endpoints of the CII pages; `overrides` replace single handlers. */
export function mockCii(
  overrides: {
    fleet?: () => Response;
    current?: () => Response;
    annual?: () => Response;
    factors?: () => Response;
  } = {},
) {
  server.use(
    http.get('*/api/v2/cii/fleet/summary', ({ request }) => {
      if (overrides.fleet) return overrides.fleet();
      const year = Number(new URL(request.url).searchParams.get('year'));
      return HttpResponse.json({ ...FLEET, year });
    }),
    http.get('*/api/v2/reduction-factors', () =>
      overrides.factors ? overrides.factors() : HttpResponse.json(FACTORS),
    ),
    http.get('*/api/v2/organizations', () =>
      HttpResponse.json({
        data: [{ id: TEST_IDS.orgA, name: 'PT Pelayaran Nusantara' }],
        meta: { page: 1, pageSize: 100, total: 1 },
      }),
    ),
    http.get('*/api/v2/vessels', () =>
      HttpResponse.json({ data: [VESSEL], meta: { page: 1, pageSize: 5, total: 1 } }),
    ),
    http.get('*/api/v2/cii/vessels/:mmsi/current', () =>
      overrides.current ? overrides.current() : HttpResponse.json(SUMMARY),
    ),
    http.get('*/api/v2/cii/vessels/:mmsi/daily', () => HttpResponse.json(DAILY)),
    http.get('*/api/v2/cii/vessels/:mmsi/annual', () =>
      overrides.annual ? overrides.annual() : HttpResponse.json(ANNUAL),
    ),
    http.get('*/api/v2/cii/vessels/:mmsi/segments', () =>
      HttpResponse.json({ data: [SEGMENT], page: { nextCursor: null, limit: 50 } }),
    ),
    http.get('*/api/v2/emission/vessels/:mmsi/dcs', () => HttpResponse.json(DCS)),
  );
}
