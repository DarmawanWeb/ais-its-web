import type {
  SurveillanceDetectorDto,
  FishingViolationDto,
  HeatmapDto,
  SurveillanceStatsDto,
} from '@/shared/api/generated/surveillance/model';

import type { SurveillanceEvent, TranshipmentResult } from '../lib/dto';

/** Fixtures of the surveillance component tests, typed with the generated DTOs. */
let seq = 0;
const uuid = () => {
  seq += 1;
  return `0192f0c8-7d3a-7c2e-9a1b-${String(seq).padStart(12, '0')}`;
};

/**
 * Events with loose payloads: the base fields are checked against the generated DTO, `data` and
 * `resolution` are partial on purpose (the feature reads them with lenient readers, and the
 * tests cover payloads that miss fields).
 */
type EventBase = Omit<SurveillanceEvent, 'type' | 'data' | 'resolution'>;
export type EventOverrides = Partial<EventBase> & {
  type?: SurveillanceEvent['type'];
  data?: Record<string, unknown>;
  resolution?: Record<string, unknown> | null;
};

export function makeEvent(overrides: EventOverrides = {}): SurveillanceEvent {
  const type = overrides.type ?? 'dark';
  const event = {
    id: uuid(),
    time: '2026-11-21T08:00:00.000Z',
    detector: type,
    type,
    domain: 'surveillance',
    severity: 'warning',
    currentSeverity: 'warning',
    mmsi: 525005223,
    relatedMmsi: null,
    vesselName: 'KM Bahari Nusantara',
    relatedVesselName: null,
    zoneId: null,
    zoneName: null,
    lat: 1.152,
    lon: 103.902,
    title: `Event ${type}`,
    message: `Detector ${type} raised an event`,
    methodId: 'dark.ais_gap',
    dedupKey: `${type}:525005223`,
    data: {},
    status: 'open',
    openedAt: '2026-11-21T08:31:00.000Z',
    lastSeenAt: '2026-11-21T08:31:00.000Z',
    resolvedAt: null,
    resolution: null,
    reviewedBy: null,
    reviewedAt: null,
    note: null,
    createdAt: '2026-11-21T08:31:00.000Z',
    ...overrides,
  } satisfies EventBase & EventOverrides;
  return event as unknown as SurveillanceEvent;
}

export function makeTranshipmentEvent(overrides: EventOverrides = {}) {
  return makeEvent({
    type: 'transhipment',
    detector: 'transhipment',
    methodId: 'transhipment.accuracy',
    mmsi: 525005223,
    relatedMmsi: 525019001,
    vesselName: 'KM Bahari Nusantara',
    relatedVesselName: 'MV Batam Express',
    severity: 'critical',
    currentSeverity: 'critical',
    dedupKey: 'transhipment:525005223:525019001',
    data: {
      isIllegal: true,
      accuracy: 92.4,
      startTimestamp: '2026-11-21T08:00:00.000Z',
      endTimestamp: '2026-11-21T08:30:00.000Z',
      averagePriority: 14.2,
      priorityDistribution: { low: 10, medium: 35, high: 55 },
      accumulatedPriority: 182,
      observations: 24,
      lastDistanceM: 48,
      route1Points: 31,
      route2Points: 29,
      methodIds: ['transhipment.accuracy', 'transhipment.priority_distribution'],
    },
    ...overrides,
  });
}

export function makeResult(overrides: Partial<TranshipmentResult> = {}): TranshipmentResult {
  return {
    id: uuid(),
    eventId: uuid(),
    ship1MMSI: 525005223,
    ship2MMSI: 525019001,
    ship1Name: 'KM Bahari Nusantara',
    ship2Name: 'MV Batam Express',
    isIllegal: true,
    startTimestamp: '2026-11-21T08:00:00.000Z',
    endTimestamp: '2026-11-21T08:30:00.000Z',
    accuracy: 92.4,
    averagePriority: 14.2,
    priorityDistribution: { low: 10, medium: 35, high: 55 },
    detectedAt: '2026-11-21T08:45:00.000Z',
    severity: 'critical',
    status: 'open',
    lat: 1.15,
    lon: 103.9,
    methodId: 'transhipment.accuracy',
    ...overrides,
  } satisfies TranshipmentResult;
}

export function makeStats(overrides: Partial<SurveillanceStatsDto> = {}): SurveillanceStatsDto {
  return {
    from: '2026-10-23T00:00:00.000Z',
    to: '2026-11-22T00:00:00.000Z',
    total: 42,
    active: 9,
    byType: { transhipment: 6, fishing: 8, dark: 12, anomaly: 14, geofence: 2 },
    bySeverity: { info: 14, warning: 20, critical: 8 },
    byStatus: { open: 18, confirmed: 7, dismissed: 5, resolved: 12 },
    transhipmentQueue: { pending: 4, inProgress: 1, completed: 31, failed: 0 },
    fishingViolations: 163,
    ...overrides,
  } satisfies SurveillanceStatsDto;
}

export const DETECTORS: SurveillanceDetectorDto[] = [
  {
    id: 'transhipment',
    domain: 'surveillance',
    methodIds: ['transhipment.accuracy', 'transhipment.candidate_queue'],
    alertTypes: ['transhipment'],
    enabled: true,
    config: {
      ACCURACY_THRESHOLD: 70,
      CRITICAL_ACCURACY: 90,
      NEIGHBOUR_RADIUS_M: 600,
      NEIGHBOUR_WINDOW_MIN: 5,
      SOURCES: ['batam'],
    },
    tickIntervalMs: 30_000,
    thresholds: [],
  },
  {
    id: 'dark',
    domain: 'surveillance',
    methodIds: ['dark.ais_gap'],
    alertTypes: ['dark'],
    enabled: true,
    config: {
      GAP_MIN: 45,
      MIN_SOG_KN: 1,
      HARBOUR_DISTANCE_KM: 5,
      HARBOUR_ZONE_KINDS: ['port', 'anchorage'],
      MAX_GAP_H: 24,
    },
    tickIntervalMs: 60_000,
    thresholds: [],
  },
  {
    id: 'anomaly',
    domain: 'surveillance',
    methodIds: ['anomaly.navstatus_mismatch'],
    alertTypes: ['anomaly'],
    enabled: true,
    config: { MIN_POSITIONS: 3 },
    tickIntervalMs: null,
    thresholds: [],
  },
  {
    id: 'fishing',
    domain: 'surveillance',
    methodIds: ['fishing.loitering'],
    alertTypes: ['fishing'],
    enabled: true,
    config: { MIN_DURATION_MIN: 30, MIN_POSITIONS: 6, MIN_SOG_KN: 0.5, MAX_SOG_KN: 4 },
    tickIntervalMs: null,
    thresholds: [],
  },
  {
    id: 'geofence',
    domain: 'surveillance',
    methodIds: ['geo.geofence_enter'],
    alertTypes: ['geofence'],
    enabled: false,
    config: null,
    tickIntervalMs: null,
    thresholds: [],
  },
];

export function makeViolation(overrides: Partial<FishingViolationDto> = {}): FishingViolationDto {
  return {
    id: uuid(),
    vesselName: 'KM Sinar Laut',
    flagCountry: 'Vietnam',
    year: 2016,
    violation: 'Penangkapan ikan tanpa izin',
    action: 'Ditenggelamkan',
    lat: 3.95,
    lon: 108.2,
    source: 'KKP Ditjen PSDKP',
    sourceNote: 'MVP dataset',
    methodId: 'fishing.apprehensions_2015_2017',
    ...overrides,
  } satisfies FishingViolationDto;
}

export const HEATMAP: HeatmapDto = {
  cells: [
    { lat: 1.1, lon: 103.9, count: 4 },
    { lat: 1.2, lon: 104, count: 2 },
  ],
  cellKm: 10,
  cellDeg: 0.0898,
  from: '2026-10-23T00:00:00.000Z',
  to: '2026-11-22T00:00:00.000Z',
  total: 6,
};

/** `{ data, page }` of a cursor list. */
export const cursorPage = <T>(data: T[], nextCursor: string | null = null) => ({
  data,
  page: { nextCursor, limit: 50 },
});
