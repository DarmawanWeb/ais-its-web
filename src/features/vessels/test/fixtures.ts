import type { VesselLatestDto } from '@/shared/api/generated/ais-processor/model';
import type { CiiSummaryDto, FleetSummaryDto } from '@/shared/api/generated/emission/model';
import type {
  EngineDto,
  FuelDto,
  FuelFormulaDto,
  PortDto,
  RegistryParticularsDto,
  VesselDetailDto,
  VesselSummaryDto,
  VesselTypeDto,
} from '@/shared/api/generated/fleet/model';
import type { AlertDto } from '@/shared/api/generated/notification/model';
import type { FuelSummaryDto, TelemetryStatusDto } from '@/shared/api/generated/telemetry/model';
import { TEST_IDS } from '@/test/tokens';

const AT = '2026-11-01T00:00:00.000Z';
const id = (n: number) => `0192f0c8-7d3a-7c2e-9a1c-${String(n).padStart(12, '0')}`;

export const TANKER: VesselTypeDto = {
  id: id(1),
  code: 'tanker',
  name: 'Tanker',
  capacityUnit: 'DWT',
  a: 5247,
  c: 0.61,
  capacityFixed: null,
  d: { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 },
  icon: 'tanker',
  source: 'IMO MEPC.353(78)',
  referenceIds: [],
  createdAt: AT,
  updatedAt: AT,
};

export const RORO: VesselTypeDto = {
  ...TANKER,
  id: id(2),
  code: 'ro_ro_passenger_ship',
  name: 'Ro-ro passenger ship',
  capacityUnit: 'GT',
  icon: 'ro-rop',
};

export const DIESEL: FuelDto = {
  id: id(11),
  code: 'diesel_gas_oil',
  name: 'Diesel / gas oil',
  carbonContent: 0.8744,
  conversionFactor: 3.206,
  density: 0.86,
  source: 'IMO MEPC.364(79)',
  referenceIds: [],
  createdAt: AT,
  updatedAt: AT,
};

export const MAIN_ENGINE: EngineDto = {
  id: id(21),
  code: 'niigata_6m28bet',
  kind: 'main',
  name: 'NIIGATA 6M28BET',
  rpm: 390,
  powerKw: 2100,
  sfoc: 179.2,
  source: null,
  referenceIds: [],
  createdAt: AT,
  updatedAt: AT,
};

export const AUX_ENGINE: EngineDto = {
  ...MAIN_ENGINE,
  id: id(22),
  code: 'man_d2866le',
  kind: 'auxiliary',
  name: 'MAN D2866LE',
  rpm: 1800,
  powerKw: 276,
  sfoc: 207,
};

export const FORMULA: FuelFormulaDto = {
  id: id(31),
  code: 'dharma_ferry_viii',
  name: 'Dharma Ferry VIII',
  mainEngineFormula: '-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197',
  auxiliaryEngineFormula: '1.5103 * Math.exp(-0.064 * speedKnot)',
  source: 'thesis — needs citation',
  createdAt: AT,
  updatedAt: AT,
};

export const PORTS: PortDto[] = [
  {
    id: id(41),
    name: 'Padang Bai',
    code: 'IDPDB',
    administrativeLocation: 'Bali',
    location: { type: 'Point', coordinates: [115.51, -8.53] },
    radiusM: 1500,
    source: null,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: id(42),
    name: 'Lembar',
    code: 'IDLEM',
    administrativeLocation: 'Nusa Tenggara Barat',
    location: { type: 'Point', coordinates: [116.07, -8.73] },
    radiusM: 1500,
    source: null,
    createdAt: AT,
    updatedAt: AT,
  },
];

export const VESSEL_DETAIL: VesselDetailDto = {
  view: 'detail',
  id: '0192f0c8-7d3a-7c2e-9a1b-000525005223',
  mmsi: 525005223,
  imo: '9037941',
  name: 'KM Bahari Nusantara',
  flag: 'ID',
  type: TANKER,
  status: 'active',
  photoUrl: null,
  updatedAt: AT,
  orgId: TEST_IDS.orgA,
  builtYear: 1990,
  annualVoyagePercentage: 41.7,
  dimensions: {
    capacity: 2877,
    dwt: 3500,
    gt: 2877,
    cb: 0.644818,
    lwl: 69.72,
    b: 16.3,
    t: 4.1,
    cwp: 0.753,
    loa: 73.3,
    lpp: 66.4,
    cp: 0.673,
    cm: 0.9806,
    cbnsp: 0.661,
    bulbousBow: false,
    cstern: 8,
    c1: 1,
    c2: 1,
    c3: 1,
    c5: 1.5,
    vs: 12,
  },
  fuel: DIESEL,
  firstFuelFormula: FORMULA,
  engines: [
    { role: 'main', quantity: 1, engine: MAIN_ENGINE },
    { role: 'auxiliary', quantity: 2, engine: AUX_ENGINE },
  ],
  ports: PORTS.map(({ id: portId, code, name }) => ({ id: portId, code, name })),
  legacyId: null,
  createdAt: AT,
};

export const VESSEL_SUMMARY: VesselSummaryDto = {
  view: 'summary',
  id: '0192f0c8-7d3a-7c2e-9a1b-000563012345',
  mmsi: 563012345,
  imo: '9311111',
  name: 'Lion City Spirit',
  flag: 'SG',
  type: { id: id(3), code: 'container_ship', name: 'Container ship', icon: 'contai' },
  status: 'active',
  photoUrl: null,
  updatedAt: AT,
};

export const REGISTRY_ENTRY: RegistryParticularsDto = {
  id: '0192f0c8-7d3a-7c2e-9a1b-00000000a001',
  imo: '9123456',
  mmsi: 525019100,
  name: 'KM SEGARA BIRU',
  built: 2004,
  flag: 'ID',
  flagName: 'Indonesia',
  type: 'Tanker',
  typeName: 'Oil Tanker',
  gt: 4200,
  dwt: 6100,
  loaM: 98.5,
  beamM: 17.2,
  draughtM: 6.3,
  class: 'Biro Klasifikasi Indonesia',
  classCode: 'BKI',
  updatedAt: AT,
};

export const LATEST: VesselLatestDto = {
  mmsi: 525005223,
  time: new Date(Date.now() - 2 * 60_000).toISOString(),
  lat: 1.152,
  lon: 103.902,
  sog: 9.8,
  cog: 248,
  hdg: 248,
  navstatus: 0,
  predictedNavstatus: 0,
  source: 'primary',
  vessel: { id: VESSEL_DETAIL.id, name: VESSEL_DETAIL.name, typeCode: 'tanker' },
};

export const CII_CURRENT: CiiSummaryDto = {
  vessel: {
    vesselId: 'v1',
    mmsi: 525005223,
    imo: null,
    name: 'KM Bahari Nusantara',
    flag: 'ID',
    typeCode: 'bulk_carrier',
    typeName: 'Bulk carrier',
  },
  year: 2026,
  source: 'segments',
  distanceNm: 18_250,
  fuelMeTon: 612.4,
  fuelAeTon: 88.1,
  co2Ton: 2245.8,
  segments: 9120,
  methods: { telemetry: 4200, firstFormula: 4500, holtrop: 420 },
  asOf: '2026-11-21T23:00:00.000Z',
  zPercent: 11,
  attained: 14.82,
  required: 15.9,
  rating: 0.932,
  grade: 'C',
  ddVector: { d1: 13.04, d2: 14.79, d3: 17.17, d4: 20.35 },
  methodIds: ['cii.attained_accumulation', 'cii.required', 'cii.rating_grade'],
  mmsi: 525005223,
  vesselId: VESSEL_DETAIL.id,
  capacity: 2877,
  lastMethod: 'telemetry',
  projection: {
    yearFraction: 0.89,
    distanceNm: 20_500,
    fuelMeTon: 688,
    fuelAeTon: 99,
    co2Ton: 2523,
    attained: 14.82,
    rating: 0.932,
    grade: 'C',
  },
};

export const FLEET_SUMMARY: FleetSummaryDto = {
  year: 2026,
  orgId: TEST_IDS.orgA,
  vessels: 2,
  grades: { A: 0, B: 0, C: 1, D: 0, E: 0 },
  notAvailable: 1,
  items: [
    {
      mmsi: 525005223,
      vesselId: VESSEL_DETAIL.id,
      name: VESSEL_DETAIL.name,
      grade: 'C',
      rating: 0.932,
      attained: 14.82,
      source: 'segments',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
  ],
  meta: { page: 1, pageSize: 100, total: 1 },
  methodIds: ['cii.rating_grade'],
};

export const TELEMETRY_STATUS: TelemetryStatusDto = {
  mmsi: 525005223,
  active: true,
  lastReadingAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  activeWindowMin: 10,
  lastReading: {
    mmsi: 525005223,
    time: new Date(Date.now() - 4 * 60_000).toISOString(),
    periodStart: null,
    fuelMeTon: 0.042,
    fuelAeTon: 0.006,
    totalFuelTon: 0.048,
    source: 'mqtt',
    deviceId: '0192f0c8-7d3a-7c2e-9a1e-000000000001',
    receivedAt: new Date().toISOString(),
  },
};

export const TELEMETRY_SUMMARY: FuelSummaryDto = {
  mmsi: 525005223,
  from: '2026-10-23T00:00:00.000Z',
  to: '2026-11-22T00:00:00.000Z',
  readings: 4320,
  fuelMeTon: 58.2,
  fuelAeTon: 7.9,
  totalFuelTon: 66.1,
  firstReadingAt: '2026-10-23T00:10:00.000Z',
  lastReadingAt: '2026-11-21T23:50:00.000Z',
};

export const ALERT: AlertDto = {
  id: '0192f0c8-7d3a-7c2e-9a1f-000000000001',
  type: 'ews',
  domain: 'safety',
  severity: 'critical',
  status: 'open',
  mmsi: 525005223,
  relatedMmsi: null,
  orgId: TEST_IDS.orgA,
  title: 'Bahaya EWS: KM Bahari Nusantara',
  message: 'Kapal diprediksi berlabuh 320 m dari Pipa Gas Batam',
  lat: 1.152,
  lon: 103.902,
  zoneId: null,
  methodId: 'ews.pipeline_distance_status',
  dedupKey: 'ews:525005223:z1',
  messageKey: null,
  messageParams: {},
  resolutionReason: null,
  resolutionMessageKey: null,
  resolutionMessageParams: {},
  resolutionEventId: null,
  data: {},
  source: 'safety',
  occurrences: 1,
  occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  lastOccurredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  acknowledgedBy: null,
  acknowledgedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
};

/** `{ data, meta }` page of fixtures. */
export function pageOf<T>(data: T[], page = 1, pageSize = 20, total = data.length) {
  return { data, meta: { page, pageSize, total } };
}
