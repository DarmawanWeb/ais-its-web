// Safety service (spec §13.7, services/safety/README.md) for the safety feature: vessel safety
// states (replacing the base defaults with states consistent with the EWS rule), detector events,
// collision encounters with their CPA/TCPA history and the detectors' active thresholds (the
// pair track of an encounter, `GET /ais/pairs/track`, is served by the surveillance module).
// Positions come from the demo vessels (lib.mjs VESSELS), so the live map, the EWS page and the
// collision page show the same picture.
import { cursorPageOf, MockHttpError, nowIso, vesselId, VESSELS } from '../lib.mjs';

const MINUTE = 60_000;
const RAD = Math.PI / 180;
const EARTH_M = 6_371_008.8;
const PIPELINE_ZONE_ID = '0192f0c8-7d3a-7c2e-9a1d-000000000001';
/** Demo pipeline (the same line as the map feature's zones fallback). */
const PIPELINE = [
  [103.66, 1.232],
  [103.76, 1.2],
  [103.85, 1.172],
  [103.9025, 1.1528],
  [103.945, 1.112],
  [103.99, 1.081],
  [104.06, 1.045],
];
const THRESHOLDS = { dangerM: 500, warningM: 1750 };
const BANDS = {
  high: { cpaNm: 0.25, tcpaMin: 6 },
  medium: { cpaNm: 0.5, tcpaMin: 12 },
  low: { cpaNm: 1, tcpaMin: 20 },
};

/** Metres from a point to the pipeline polyline (local equirectangular projection). */
function pipelineDistanceM(lon, lat) {
  let best = Infinity;
  for (let i = 0; i < PIPELINE.length - 1; i++) {
    const [ax, ay] = PIPELINE[i];
    const [bx, by] = PIPELINE[i + 1];
    const k = Math.cos(lat * RAD);
    const px = (lon - ax) * k;
    const py = lat - ay;
    const vx = (bx - ax) * k;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(px - vx * t, py - vy * t) * RAD * EARTH_M);
  }
  return Math.round(best * 10) / 10;
}

const vessel = (mmsi) => VESSELS.find(([m]) => m === mmsi);

/** Vessels the safety service predicts at anchor (the only ones the EWS rule rates). */
const ANCHORED = new Set([525005223, 525019003]);
/** Current collision states: [mmsiA, mmsiB, risk, cpaNm, tcpaMin]. */
const LIVE_PAIRS = [
  [525019001, 525019005, 'high', 0.06, 5.8],
  [525019004, 563012345, 'medium', 0.064, 11.5],
];

function ewsOf(mmsi, lon, lat) {
  const distance = pipelineDistanceM(lon, lat);
  if (!ANCHORED.has(mmsi)) return { ewsStatus: 3, distance };
  return {
    ewsStatus: distance < THRESHOLDS.dangerM ? 0 : distance < THRESHOLDS.warningM ? 1 : 3,
    distance,
  };
}

/** `SafetyVesselStateDto[]` of every demo vessel. */
export function safetyStates() {
  const time = nowIso();
  return VESSELS.map(([mmsi, name, , lat, lon, hdg, sog]) => {
    const { ewsStatus, distance } = ewsOf(mmsi, lon, lat);
    const pair = LIVE_PAIRS.find(([a, b]) => a === mmsi || b === mmsi);
    const anchored = ANCHORED.has(mmsi);
    return {
      mmsi,
      time,
      lat,
      lon,
      positionTime: time,
      sog: anchored ? 0.1 : sog,
      cog: hdg,
      hdg,
      navstatus: anchored ? 1 : 0,
      predictedNavstatus: anchored ? 1 : 0,
      ewsStatus,
      pipelineDistanceM: distance,
      nearestPipelineZoneId: PIPELINE_ZONE_ID,
      collisionRisk: pair ? pair[2] : 'none',
      closestEncounter: pair
        ? { otherMmsi: pair[0] === mmsi ? pair[1] : pair[0], cpaNm: pair[3], tcpaMin: pair[4] }
        : null,
      methodIds: ['ews.pipeline_distance_status', 'collision.cpa_tcpa'],
      vessel: { id: vesselId(mmsi), name },
      updatedAt: time,
    };
  });
}

/** `RealtimeSafetyState` of a state (spec §9). */
const realtimeStateOf = ({ mmsi, time, lat, lon, ewsStatus, collisionRisk, closestEncounter }) => ({
  mmsi,
  time,
  lat,
  lon,
  ewsStatus,
  collisionRisk,
  closestEncounter,
});

// --- encounters -------------------------------------------------------------------------------

/** Position of a vessel `minutes` after (negative: before) its reference fix. */
function dead([lat, lon], cog, sog, minutes) {
  const nm = (sog * minutes) / 60;
  return [
    lat + (nm / 60) * Math.cos(cog * RAD),
    lon + ((nm / 60) * Math.sin(cog * RAD)) / Math.cos(lat * RAD),
  ];
}

function bandOf(cpaNm, tcpaMin, previous) {
  const widen = previous && previous !== 'none' ? 1.2 : 1;
  for (const band of ['high', 'medium', 'low']) {
    const factor = band === previous ? widen : 1;
    if (
      cpaNm < BANDS[band].cpaNm * factor &&
      tcpaMin >= 0 &&
      tcpaMin < BANDS[band].tcpaMin * factor
    )
      return band;
  }
  return 'none';
}

/**
 * [id suffix, mmsiA, mmsiB, end (minutes ago; 0 = active), duration (min), min CPA, TCPA at the end,
 * reference offset of the positions for ended encounters (degrees)].
 */
const ENCOUNTERS = [
  ['e001', 525019001, 525019005, 0, 16, 0.06, 5.8, [0, 0]],
  ['e002', 525019004, 563012345, 0, 24, 0.064, 11.5, [0, 0]],
  ['e003', 525019002, 538007788, 180, 22, 0.14, 2.4, [0.02, 0.03]],
  ['e004', 525019007, 525019008, 540, 18, 0.72, 9.5, [-0.03, 0.02]],
  ['e005', 525019006, 525019009, 1_560, 20, 0.33, 7.2, [0.01, -0.02]],
];

/** Samples every minute: CPA closing in on its minimum, TCPA counting down. */
function buildEncounter([suffix, mmsiA, mmsiB, endAgo, duration, minCpa, endTcpa, [dLat, dLon]]) {
  const [, , , latA, lonA, cogA, sogA] = vessel(mmsiA);
  const [, , , latB, lonB, cogB, sogB] = vessel(mmsiB);
  const end = Date.now() - endAgo * MINUTE;
  const refA = [latA + dLat, lonA + dLon];
  const refB = [latB + dLat, lonB + dLon];
  const history = [];
  let previous = 'none';
  for (let minute = duration; minute >= 0; minute -= 1) {
    const time = new Date(end - minute * MINUTE).toISOString();
    const [la, oa] = dead(refA, cogA, sogA, -minute);
    const [lb, ob] = dead(refB, cogB, sogB, -minute);
    const cpaNm = Math.round((minCpa + 0.85 * (1 - Math.exp(-minute / 6))) * 1000) / 1000;
    const tcpaMin = Math.round((endTcpa + minute * 0.92) * 10) / 10;
    const rangeNm =
      Math.round(Math.hypot((la - lb) * 60, (oa - ob) * 60 * Math.cos(la * RAD)) * 1000) / 1000;
    const risk = bandOf(cpaNm, tcpaMin, previous);
    previous = risk;
    history.push({
      time,
      cpaNm,
      tcpaMin,
      rangeNm,
      risk,
      positions: {
        a: { mmsi: mmsiA, time, lat: la, lon: oa, sog: sogA, cog: cogA },
        b: { mmsi: mmsiB, time, lat: lb, lon: ob, sog: sogB, cog: cogB },
      },
    });
  }
  const order = ['none', 'low', 'medium', 'high'];
  const peakRisk = history.reduce(
    (peak, s) => (order.indexOf(s.risk) > order.indexOf(peak) ? s.risk : peak),
    'none',
  );
  return {
    encounterId: `0192f0c8-7d3a-7c2e-9a1e-00000000${suffix}`,
    mmsiA,
    mmsiB,
    startedAt: history[0].time,
    lastSampleAt: history.at(-1).time,
    peakRisk,
    minCpaNm: Math.min(...history.map((s) => s.cpaNm)),
    history,
    motion: { refA, refB, cogA, sogA, cogB, sogB, end },
  };
}

const encounters = () => ENCOUNTERS.map(buildEncounter);
/** The encounter as the API returns it (without the mock's motion model). */
function publicEncounter(encounter) {
  const copy = { ...encounter };
  delete copy.motion;
  return copy;
}

// --- events -----------------------------------------------------------------------------------

/** Event ids are alert ids (the alerts feature's demo alerts use the same ones). */
function buildEvents() {
  const at = (minutes) => new Date(Date.now() - minutes * MINUTE).toISOString();
  const ews = (suffix, mmsi, severity, status, minutesAgo, resolvedAgo) => {
    const [, name, , lat, lon] = vessel(mmsi);
    const distance = pipelineDistanceM(lon, lat);
    return {
      id: `0192f0c8-7d3a-7c2e-9a1b-0000000${suffix}`,
      time: at(minutesAgo),
      detector: 'ews',
      type: 'ews',
      domain: 'safety',
      severity,
      currentSeverity: severity,
      status,
      mmsi,
      relatedMmsi: null,
      zoneId: PIPELINE_ZONE_ID,
      lat,
      lon,
      title: `${severity === 'critical' ? 'EWS danger' : 'EWS warning'}: ${name}`,
      message: `${name} is predicted at anchor ${Math.round(distance)} m from pipeline Pipa Gas Batam (${severity === 'critical' ? 'danger below 500' : 'warning below 1750'} m)`,
      methodId: 'ews.pipeline_distance_status',
      dedupKey: `ews:${mmsi}:${PIPELINE_ZONE_ID}`,
      data: {
        methodId: 'ews.pipeline_distance_status',
        ewsStatus: severity === 'critical' ? 0 : 1,
        pipelineDistanceM: distance,
        zoneId: PIPELINE_ZONE_ID,
        zoneCode: 'PGB-01',
        zoneName: 'Pipa Gas Batam',
        thresholds: THRESHOLDS,
      },
      openedAt: at(minutesAgo),
      lastSeenAt: at(resolvedAgo ?? 1),
      resolvedAt: resolvedAgo === null ? null : at(resolvedAgo),
      resolution: resolvedAgo === null ? null : { reason: 'cleared', pipelineDistanceM: 1980 },
    };
  };
  const collision = (suffix, encounter, severity, status) => {
    const last = encounter.history.at(-1);
    return {
      id: `0192f0c8-7d3a-7c2e-9a1b-0000000${suffix}`,
      time: encounter.startedAt,
      detector: 'collision',
      type: 'collision',
      domain: 'safety',
      severity,
      currentSeverity: severity,
      status,
      mmsi: encounter.mmsiA,
      relatedMmsi: encounter.mmsiB,
      zoneId: null,
      lat: last.positions.a.lat,
      lon: last.positions.a.lon,
      title: `Collision risk ${encounter.peakRisk}: ${encounter.mmsiA} / ${encounter.mmsiB}`,
      message: `CPA ${encounter.minCpaNm} nm in ${last.tcpaMin} min`,
      methodId: 'collision.cpa_tcpa',
      dedupKey: `collision:${encounter.mmsiA}:${encounter.mmsiB}`,
      data: {
        methodId: 'collision.cpa_tcpa',
        risk: encounter.peakRisk,
        cpaNm: encounter.minCpaNm,
        tcpaMin: last.tcpaMin,
        rangeNm: last.rangeNm,
        encounterId: encounter.encounterId,
      },
      openedAt: encounter.startedAt,
      lastSeenAt: encounter.lastSampleAt,
      resolvedAt: status === 'resolved' ? encounter.lastSampleAt : null,
      resolution: status === 'resolved' ? { reason: 'cleared' } : null,
    };
  };
  const list = encounters();
  return [
    ews('a1e01', 525005223, 'critical', 'open', 9, null),
    ews('a1e04', 525019003, 'warning', 'open', 98, null),
    ews('a1e10', 525019004, 'warning', 'resolved', 2_910, 2_860),
    collision('a1e11', list[0], 'critical', 'open'),
    collision('a1e02', list[1], 'warning', 'open'),
    collision('a1e07', list[2], 'critical', 'resolved'),
  ].sort((a, b) => b.time.localeCompare(a.time));
}

// --- routes -----------------------------------------------------------------------------------

function validationFailed(field, message) {
  return new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
    errors: [{ field, message }],
  });
}

function listParams(url, keys) {
  const params = new URL(url);
  for (const key of keys) params.searchParams.delete(key);
  return params;
}

function timeParam(url, key) {
  const value = url.searchParams.get(key);
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw validationFailed(key, 'must be an ISO-8601 date-time');
  return time;
}

function bboxParam(url) {
  const value = url.searchParams.get('bbox');
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite))
    throw validationFailed('bbox', 'minLon,minLat,maxLon,maxLat');
  return parts;
}

const inBox = (box, lat, lon) =>
  !box || (lon >= box[0] && lat >= box[1] && lon <= box[2] && lat <= box[3]);

/** @type {import('../lib.mjs').MockRealtimeHooks} */
export const realtime = {
  // The latest known states (sent on `vessel:subscribe`), after the base module's defaults.
  start: (rt) => rt.safetyStates(safetyStates().map(realtimeStateOf)),
};

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/safety/vessels',
    permission: 'safety:read',
    handler: ({ url, send }) => {
      const box = bboxParam(url);
      const ews = url.searchParams.get('ewsStatus')?.split(',').map(Number) ?? null;
      const risk = url.searchParams.get('collisionRisk')?.split(',') ?? null;
      const limit = Number(url.searchParams.get('limit') ?? 5_000);
      send(
        200,
        safetyStates()
          .filter(
            (s) =>
              inBox(box, s.lat, s.lon) &&
              (!ews || ews.includes(s.ewsStatus)) &&
              (!risk || risk.includes(s.collisionRisk)),
          )
          .slice(0, limit),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/v2/safety/vessels/:mmsi',
    permission: 'safety:read',
    handler: ({ params, send }) => {
      const state = safetyStates().find((s) => String(s.mmsi) === params.mmsi);
      if (!state) {
        throw new MockHttpError(404, 'SAFETY_STATE_NOT_FOUND', 'Safety state not found', {
          detail: `No safety state of MMSI ${params.mmsi}`,
        });
      }
      send(200, state);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/safety/events',
    permission: 'safety:read',
    handler: ({ url, send }) => {
      const q = url.searchParams;
      const from =
        timeParam(url, 'from') ??
        (q.get('status') === 'open' ? 0 : Date.now() - 7 * 24 * 60 * MINUTE);
      const to = timeParam(url, 'to') ?? Date.now();
      const box = bboxParam(url);
      const mmsi = q.get('mmsi') ? Number(q.get('mmsi')) : null;
      const items = buildEvents().filter(
        (e) =>
          (!q.get('detector') || e.detector === q.get('detector')) &&
          (!q.get('severity') || e.severity === q.get('severity')) &&
          (!q.get('status') || e.status === q.get('status')) &&
          (mmsi === null || e.mmsi === mmsi || e.relatedMmsi === mmsi) &&
          Date.parse(e.time) >= from &&
          Date.parse(e.time) <= to &&
          inBox(box, e.lat, e.lon),
      );
      send(
        200,
        cursorPageOf(
          items,
          listParams(url, ['detector', 'severity', 'status', 'mmsi', 'from', 'to', 'bbox']),
        ),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/v2/safety/events/:id',
    permission: 'safety:read',
    handler: ({ params, send }) => {
      const event = buildEvents().find((e) => e.id === params.id);
      if (!event) throw new MockHttpError(404, 'SAFETY_EVENT_NOT_FOUND', 'Safety event not found');
      send(200, event);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/safety/encounters',
    permission: 'safety:read',
    handler: ({ url, send }) => {
      const q = url.searchParams;
      // Samples are generated after this line: a missing `to` (now) includes the latest one.
      const to = timeParam(url, 'to') ?? Date.now() + MINUTE;
      const from = timeParam(url, 'from') ?? to - 24 * 60 * MINUTE;
      if (to - from > 31 * 24 * 60 * MINUTE + MINUTE)
        throw validationFailed('from', 'the range is at most 31 days');
      const risks = q.get('risk')?.split(',') ?? null;
      const mmsi = q.get('mmsi') ? Number(q.get('mmsi')) : null;
      const id = q.get('encounterId');
      const items = encounters()
        .map((encounter) => {
          const history = encounter.history.filter(
            (s) => Date.parse(s.time) >= from && Date.parse(s.time) <= to,
          );
          if (history.length === 0) return null;
          const order = ['none', 'low', 'medium', 'high'];
          return {
            ...encounter,
            history,
            startedAt: history[0].time,
            lastSampleAt: history.at(-1).time,
            minCpaNm: Math.min(...history.map((s) => s.cpaNm)),
            peakRisk: history.reduce(
              (peak, s) => (order.indexOf(s.risk) > order.indexOf(peak) ? s.risk : peak),
              'none',
            ),
          };
        })
        .filter(
          (e) =>
            e &&
            (!id || e.encounterId === id) &&
            (!risks || risks.includes(e.peakRisk)) &&
            (mmsi === null || e.mmsiA === mmsi || e.mmsiB === mmsi),
        )
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(publicEncounter);
      send(
        200,
        cursorPageOf(items, listParams(url, ['risk', 'mmsi', 'encounterId', 'from', 'to'])),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/v2/safety/detectors',
    permission: 'safety:read',
    handler: ({ send }) =>
      send(200, [
        {
          id: 'ews',
          domain: 'safety',
          methodIds: ['ews.pipeline_distance_status'],
          alertTypes: ['ews'],
          enabled: true,
          config: { DANGER_M: THRESHOLDS.dangerM, WARNING_M: THRESHOLDS.warningM },
          tickIntervalMs: null,
        },
        {
          id: 'collision',
          domain: 'safety',
          methodIds: ['collision.cpa_tcpa'],
          alertTypes: ['collision'],
          enabled: true,
          config: {
            SEARCH_RADIUS_NM: 6,
            MAX_AGE_S: 120,
            MIN_SOG_KN: 0.5,
            HIGH_CPA_NM: BANDS.high.cpaNm,
            HIGH_TCPA_MIN: BANDS.high.tcpaMin,
            MEDIUM_CPA_NM: BANDS.medium.cpaNm,
            MEDIUM_TCPA_MIN: BANDS.medium.tcpaMin,
            LOW_CPA_NM: BANDS.low.cpaNm,
            LOW_TCPA_MIN: BANDS.low.tcpaMin,
            HYSTERESIS: 0.2,
            SAMPLE_INTERVAL_S: 30,
          },
          tickIntervalMs: 30_000,
        },
      ]),
  },
];
