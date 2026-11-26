// Mock endpoints of the surveillance service (feature `surveillance`, spec §13.8):
// GET /surveillance/events[/:id], PATCH /surveillance/events/:id (review), GET /transhipments,
// /heatmap, /fishing-violations, /stats, /detectors — and GET /ais/pairs/track (ais-processor) as
// a RegExp *fallback* route, so a feature that owns the ais-processor mocks can declare the
// literal path without a start-up conflict (literal routes rank before RegExps).
// Shapes follow services/surveillance/openapi.json; tenancy follows the service README:
// authority and super_admin see every event, other roles only events whose mmsi or
// relatedMmsi belongs to a vessel of the demo fleet organization.
import { cursorPageOf, MockHttpError, pageOf, VESSELS } from '../lib.mjs';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Zone ids shared with routes/zones.mjs (global demo zones). */
const ZONE = {
  batamTranshipment: '0192f0c8-7d3a-7c2e-9a1f-000000000002',
  natunaFishing: '0192f0c8-7d3a-7c2e-9a1f-000000000005',
  batamRestricted: '0192f0c8-7d3a-7c2e-9a1f-000000000004',
};

const FOREIGN = {
  412345678: 'Hai Feng 168',
  574001122: 'Viet Ocean 9',
  440112233: 'Dong Won 701',
};

const FLEET_MMSIS = new Set(VESSELS.map(([mmsi]) => mmsi));
const nameOf = (mmsi) => VESSELS.find(([m]) => m === mmsi)?.[1] ?? FOREIGN[mmsi] ?? null;
const positionOf = (mmsi) => {
  const vessel = VESSELS.find(([m]) => m === mmsi);
  return vessel ? { lat: vessel[3], lon: vessel[4] } : { lat: 1.1, lon: 104.1 };
};

const eventId = (n) => `0192f0c8-7d3a-7c2e-9a1d-${String(n).padStart(12, '0')}`;
const resultId = (n) => `0192f0c8-7d3a-7c2e-9a1e-${String(n).padStart(12, '0')}`;
const REVIEWER_ID = '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a';

const METHOD = {
  transhipment: 'transhipment.accuracy',
  anomaly: 'anomaly.navstatus_mismatch',
  dark: 'dark.ais_gap',
  geofence: 'geo.geofence_enter',
  fishing: 'fishing.loitering',
};

/** Deterministic pseudo-random numbers (mulberry32) so every reset yields the same data. */
function random(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString();

function baseEvent(
  n,
  type,
  { mmsi, relatedMmsi = null, at, severity, lat, lon, title, message, data },
) {
  return {
    id: eventId(n),
    time: iso(at),
    detector: type,
    type,
    domain: 'surveillance',
    severity,
    currentSeverity: severity,
    mmsi,
    relatedMmsi,
    vesselName: nameOf(mmsi),
    relatedVesselName: relatedMmsi === null ? null : nameOf(relatedMmsi),
    zoneId: null,
    zoneName: null,
    lat,
    lon,
    title,
    message,
    methodId: METHOD[type],
    dedupKey:
      relatedMmsi === null
        ? `${type}:${mmsi}`
        : `${type}:${Math.min(mmsi, relatedMmsi)}:${Math.max(mmsi, relatedMmsi)}`,
    data,
    status: 'open',
    openedAt: iso(at + 2 * MINUTE),
    lastSeenAt: iso(at + 2 * MINUTE),
    resolvedAt: null,
    resolution: null,
    reviewedBy: null,
    reviewedAt: null,
    note: null,
    createdAt: iso(at + 2 * MINUTE),
  };
}

function distribution(rand) {
  const high = Math.round(30 + rand() * 40);
  const medium = Math.round((100 - high) * (0.5 + rand() * 0.3));
  return { low: 100 - high - medium, medium, high };
}

/** Builds the demo dataset relative to `now`. */
function buildData(now = Date.now()) {
  const rand = random(20261122);
  const events = [];
  const results = [];
  let n = 0;
  let r = 0;

  // --- transhipment: pairs side by side around Batam ---------------------------------------
  const pairs = [
    {
      a: 525005223,
      b: 525019004,
      ago: 2 * HOUR,
      accuracy: 92.4,
      lat: 1.1342,
      lon: 103.8885,
      status: 'open',
      resolved: false,
    },
    {
      a: 412345678,
      b: 563045678,
      ago: 1 * DAY + 3 * HOUR,
      accuracy: 78.1,
      lat: 1.2215,
      lon: 103.9702,
      status: 'confirmed',
      resolved: true,
      note: 'Dikonfirmasi patroli KSOP: alih muat BBM tanpa izin.',
    },
    {
      a: 525019002,
      b: 538007788,
      ago: 3 * DAY,
      accuracy: 71.3,
      lat: 1.0921,
      lon: 103.7503,
      status: 'dismissed',
      resolved: true,
      note: 'Bunkering resmi di area labuh.',
    },
    {
      a: 525019007,
      b: 574001122,
      ago: 6 * DAY,
      accuracy: 95.0,
      lat: 1.2063,
      lon: 104.0411,
      status: 'open',
      resolved: true,
    },
    {
      a: 525019003,
      b: 525019009,
      ago: 12 * DAY,
      accuracy: 74.8,
      lat: 1.0705,
      lon: 103.8952,
      status: 'open',
      resolved: true,
    },
    {
      a: 563012345,
      b: 636019900,
      ago: 20 * DAY,
      accuracy: 70.6,
      lat: 1.1702,
      lon: 103.9993,
      status: 'dismissed',
      resolved: true,
    },
  ];
  for (const pair of pairs) {
    n += 1;
    const [mmsi, relatedMmsi] = pair.a < pair.b ? [pair.a, pair.b] : [pair.b, pair.a];
    const start = now - pair.ago;
    const end = start + (35 + Math.round(rand() * 25)) * MINUTE;
    const severity = pair.accuracy >= 90 ? 'critical' : 'warning';
    const dist = distribution(rand);
    const data = {
      isIllegal: true,
      accuracy: pair.accuracy,
      startTimestamp: iso(start),
      endTimestamp: iso(end),
      averagePriority: Number((8 + rand() * 12).toFixed(2)),
      priorityDistribution: dist,
      accumulatedPriority: Math.round(90 + rand() * 160),
      observations: Math.round(14 + rand() * 20),
      lastDistanceM: Math.round(25 + rand() * 60),
      route1Points: Math.round(24 + rand() * 12),
      route2Points: Math.round(24 + rand() * 12),
      methodIds: [
        'transhipment.accuracy',
        'transhipment.priority_distribution',
        'transhipment.sliding_window',
      ],
    };
    const event = baseEvent(n, 'transhipment', {
      mmsi,
      relatedMmsi,
      at: start,
      severity,
      lat: pair.lat,
      lon: pair.lon,
      title: `Suspected transhipment ${mmsi} ↔ ${relatedMmsi}`,
      message: `Vessels ${mmsi} and ${relatedMmsi} stayed side by side at low speed (score ${pair.accuracy} %)`,
      data,
    });
    event.zoneId = ZONE.batamTranshipment;
    event.zoneName = 'Area transhipment Batam';
    event.openedAt = iso(end + 10 * MINUTE);
    event.lastSeenAt = iso(end + 25 * MINUTE);
    event.createdAt = event.openedAt;
    if (pair.resolved) {
      event.resolvedAt = iso(end + 85 * MINUTE);
      event.resolution = { reason: 'pair not observed together', expiredAfterMin: 60 };
    }
    if (pair.status !== 'open') {
      event.status = pair.status;
      event.reviewedBy = REVIEWER_ID;
      event.reviewedAt = iso(end + 3 * HOUR);
      event.note = pair.note ?? null;
    } else if (pair.resolved) {
      event.status = 'resolved';
    }
    events.push(event);
    const analyses = pair.resolved ? 2 : 1;
    for (let i = 0; i < analyses; i += 1) {
      r += 1;
      const shift = i * 20 * MINUTE;
      results.push({
        id: resultId(r),
        eventId: event.id,
        ship1MMSI: mmsi,
        ship2MMSI: relatedMmsi,
        ship1Name: nameOf(mmsi),
        ship2Name: nameOf(relatedMmsi),
        isIllegal: true,
        startTimestamp: iso(start + shift),
        endTimestamp: iso(end + shift),
        accuracy: Number((pair.accuracy - i * 3.1).toFixed(2)),
        averagePriority: data.averagePriority,
        priorityDistribution: i === 0 ? dist : distribution(rand),
        detectedAt: iso(end + shift + 10 * MINUTE),
        severity: pair.accuracy - i * 3.1 >= 90 ? 'critical' : 'warning',
        status: event.status,
        lat: pair.lat,
        lon: pair.lon,
        methodId: 'transhipment.accuracy',
      });
    }
  }

  // --- dark vessels: AIS gaps away from harbours ---------------------------------------------
  const dark = [
    { mmsi: 525019008, ago: 50 * MINUTE, open: true, sog: 12.4, harbour: 18_400 },
    { mmsi: 440112233, ago: 4 * HOUR, open: true, sog: 6.1, harbour: 42_100 },
    { mmsi: 563012345, ago: 9 * HOUR, open: false, gap: 95, sog: 13.8, harbour: 7_900 },
    { mmsi: 525019006, ago: 2 * DAY, open: false, gap: 48, sog: 15.2, harbour: 11_300 },
    { mmsi: 538007788, ago: 5 * DAY, open: false, gap: 212, sog: 9.6, harbour: 26_000 },
    { mmsi: 525019001, ago: 9 * DAY, open: false, gap: 37, sog: 17.9, harbour: 6_200 },
    { mmsi: 574001122, ago: 15 * DAY, open: false, gap: 640, sog: 5.3, harbour: null },
  ];
  for (const item of dark) {
    n += 1;
    const lastSeen = now - item.ago;
    const base = positionOf(item.mmsi);
    const lat = Number((base.lat + (rand() - 0.5) * 0.25).toFixed(4));
    const lon = Number((base.lon + 0.18 + rand() * 0.2).toFixed(4));
    const gapAtRaise = 31 + Math.round(rand() * 6);
    const event = baseEvent(n, 'dark', {
      mmsi: item.mmsi,
      at: lastSeen,
      severity: 'warning',
      lat,
      lon,
      title: `AIS gap of ${item.mmsi}`,
      message: `Vessel ${item.mmsi} stopped reporting while under way at ${item.sog.toFixed(1)} kn`,
      data: {
        lastSeenAt: iso(lastSeen),
        lastSogKn: item.sog,
        lastCogDeg: Math.round(rand() * 359),
        gapMin: gapAtRaise,
        gapThresholdMin: 30,
        nearestHarbourM: item.harbour,
      },
    });
    event.openedAt = iso(lastSeen + gapAtRaise * MINUTE);
    event.lastSeenAt = event.openedAt;
    event.createdAt = event.openedAt;
    if (!item.open) {
      const back = lastSeen + item.gap * MINUTE;
      event.resolvedAt = iso(back);
      event.status = 'resolved';
      event.resolution = {
        reason: 'AIS reports resumed',
        reappearedAt: iso(back),
        lastSeenAt: iso(lastSeen),
        gapMin: item.gap,
        lat: Number((lat + 0.05 + rand() * 0.08).toFixed(4)),
        lon: Number((lon + 0.04 + rand() * 0.1).toFixed(4)),
      };
    }
    events.push(event);
  }

  // --- navigational status anomalies ---------------------------------------------------------
  const anomalies = [
    {
      mmsi: 525019004,
      ago: 25 * MINUTE,
      navstatus: 1,
      predicted: 0,
      streak: 5,
      sog: 6.8,
      open: true,
    },
    { mmsi: 525005223, ago: 7 * HOUR, navstatus: 0, predicted: 1, streak: 3, sog: 0.2, open: true },
    {
      mmsi: 636019900,
      ago: 30 * HOUR,
      navstatus: 5,
      predicted: 1,
      streak: 4,
      sog: 0.1,
      open: false,
    },
    { mmsi: 525019009, ago: 3 * DAY, navstatus: 1, predicted: 0, streak: 3, sog: 8.9, open: false },
    { mmsi: 563045678, ago: 8 * DAY, navstatus: 0, predicted: 1, streak: 3, sog: 0.4, open: false },
    {
      mmsi: 412345678,
      ago: 11 * DAY,
      navstatus: 1,
      predicted: 0,
      streak: 6,
      sog: 10.2,
      open: false,
    },
  ];
  for (const item of anomalies) {
    n += 1;
    const at = now - item.ago;
    const base = positionOf(item.mmsi);
    const event = baseEvent(n, 'anomaly', {
      mmsi: item.mmsi,
      at,
      severity: 'info',
      lat: Number((base.lat + (rand() - 0.5) * 0.06).toFixed(4)),
      lon: Number((base.lon + (rand() - 0.5) * 0.06).toFixed(4)),
      title: `Navigational status anomaly of ${item.mmsi}`,
      message: `Vessel ${item.mmsi} reports navstatus ${item.navstatus} while its motion predicts ${item.predicted === 1 ? 'at anchor' : 'under way'}`,
      data: {
        navstatus: item.navstatus,
        predictedNavstatus: item.predicted,
        streak: item.streak,
        minPositions: 3,
        sogKn: item.sog,
      },
    });
    if (!item.open) {
      event.resolvedAt = iso(at + 40 * MINUTE);
      event.status = 'resolved';
      event.resolution = {
        reason: 'navigational status consistent again',
        navstatus: item.predicted === 1 ? 1 : 0,
      };
    }
    events.push(event);
  }

  // --- fishing loitering in the Natuna fishing ground (heatmap) ------------------------------
  const fishers = [574001122, 440112233, 412345678, 525019004, 525019006];
  for (let i = 0; i < 22; i += 1) {
    n += 1;
    const mmsi = fishers[i % fishers.length];
    const at = now - (2 + i * 31) * HOUR;
    const cluster = i % 3;
    const lat = Number(
      ((cluster === 0 ? 4.05 : cluster === 1 ? 3.62 : 4.48) + (rand() - 0.5) * 0.4).toFixed(4),
    );
    const lon = Number(
      ((cluster === 0 ? 108.15 : cluster === 1 ? 107.55 : 108.7) + (rand() - 0.5) * 0.5).toFixed(4),
    );
    const durationMin = Math.round(34 + rand() * 90);
    const event = baseEvent(n, 'fishing', {
      mmsi,
      at,
      severity: i % 7 === 0 ? 'critical' : 'warning',
      lat,
      lon,
      title: 'Suspected fishing in Natuna Utara',
      message: `Vessel ${mmsi} loitered with frequent course changes for ${durationMin} min`,
      data: {
        zoneKind: 'fishing_ground',
        zoneCode: 'natuna-fishing',
        zoneName: 'Daerah penangkapan ikan Natuna Utara',
        durationMin,
        positions: Math.round(8 + rand() * 20),
        meanSogKn: Number((1 + rand() * 2.5).toFixed(1)),
        courseChangeRateDegPerMin: Number((3.2 + rand() * 6).toFixed(1)),
        totalCourseChangeDeg: Math.round(200 + rand() * 900),
      },
    });
    event.zoneId = ZONE.natunaFishing;
    event.zoneName = 'Daerah penangkapan ikan Natuna Utara';
    if (i > 1) {
      event.resolvedAt = iso(at + (durationMin + 30) * MINUTE);
      event.status = i % 5 === 0 ? 'confirmed' : 'resolved';
      event.resolution = { reason: i % 2 ? 'left the zone' : 'loitering pattern ended' };
      if (event.status === 'confirmed') {
        event.reviewedBy = REVIEWER_ID;
        event.reviewedAt = iso(at + 6 * HOUR);
        event.note = 'Ditindaklanjuti PSDKP.';
      }
    }
    events.push(event);
  }

  // --- geofence entries into the restricted area off Batam ------------------------------------
  for (const [index, mmsi] of [525019002, 538007788, 440112233].entries()) {
    n += 1;
    const at = now - (5 + index * 40) * HOUR;
    const event = baseEvent(n, 'geofence', {
      mmsi,
      at,
      severity: 'critical',
      lat: Number((1.205 + index * 0.01).toFixed(4)),
      lon: Number((104.075 + index * 0.012).toFixed(4)),
      title: 'Entered Area terlarang Batu Ampar',
      message: `Vessel ${mmsi} entered Area terlarang Batu Ampar (restricted)`,
      data: {
        zoneKind: 'restricted',
        zoneCode: 'btm-restricted',
        zoneName: 'Area terlarang Batu Ampar',
        sogKn: 7.4 + index,
      },
    });
    event.zoneId = ZONE.batamRestricted;
    event.zoneName = 'Area terlarang Batu Ampar';
    if (index > 0) {
      event.resolvedAt = iso(at + 50 * MINUTE);
      event.status = 'resolved';
      event.resolution = { reason: 'left the zone' };
    }
    events.push(event);
  }

  events.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  results.sort((a, b) => Date.parse(b.startTimestamp) - Date.parse(a.startTimestamp));
  return { events, results };
}

const FLAGS = ['Vietnam', 'Tiongkok', 'Filipina', 'Thailand', 'Malaysia', 'Indonesia'];
const VIOLATIONS = [
  'Menangkap ikan tanpa SIPI',
  'Menggunakan alat tangkap terlarang (trawl)',
  'Kapal asing tanpa izin di ZEE Indonesia',
  'Alih muat ikan di tengah laut tanpa izin',
];
const ACTIONS = ['Ditenggelamkan', 'Dirampas untuk negara', 'Diproses hukum', 'Dihibahkan'];

function buildViolations() {
  const rand = random(2015);
  const areas = [
    { lat: 4.2, lon: 108.1, spread: 1.2 },
    { lat: -7.5, lon: 134.2, spread: 1.6 },
    { lat: 3.6, lon: 125.4, spread: 0.9 },
    { lat: 2.4, lon: 101.6, spread: 0.6 },
  ];
  return Array.from({ length: 46 }, (_, index) => {
    const area = areas[index % areas.length];
    const year = 2015 + (index % 3);
    return {
      id: `0192f0c8-7d3a-7c2e-9a20-${String(index + 1).padStart(12, '0')}`,
      vesselName: `KM ${['Sinar', 'Hai', 'Phuc', 'Jaya', 'Lucky'][index % 5]} ${['Laut', 'Feng', 'Hai', 'Bahari', 'Star'][(index * 3) % 5]} ${100 + index}`,
      flagCountry: FLAGS[index % FLAGS.length],
      year,
      violation: VIOLATIONS[index % VIOLATIONS.length],
      action: ACTIONS[index % ACTIONS.length],
      lat: Number((area.lat + (rand() - 0.5) * area.spread).toFixed(4)),
      lon: Number((area.lon + (rand() - 0.5) * area.spread * 1.4).toFixed(4)),
      source: 'KKP Ditjen PSDKP (dataset MVP ilegal.json)',
      sourceNote: 'Catatan MVP; asal data masih perlu dikutip dari tesis (needs citation).',
      methodId: 'fishing.apprehensions_2015_2017',
    };
  });
}

const DETECTORS = [
  {
    id: 'transhipment',
    domain: 'surveillance',
    methodIds: [
      'transhipment.accuracy',
      'transhipment.candidate_queue',
      'transhipment.sliding_window',
      'transhipment.priority_distribution',
    ],
    alertTypes: ['transhipment'],
    enabled: true,
    config: {
      SOURCES: ['batam'],
      ZONE_KINDS: ['transhipment_area'],
      NEIGHBOUR_RADIUS_M: 600,
      NEIGHBOUR_WINDOW_MIN: 5,
      ACCURACY_THRESHOLD: 70,
      CRITICAL_ACCURACY: 90,
      ANALYSIS_INTERVAL_S: 30,
    },
    tickIntervalMs: 30_000,
  },
  {
    id: 'anomaly',
    domain: 'surveillance',
    methodIds: ['anomaly.navstatus_mismatch'],
    alertTypes: ['anomaly'],
    enabled: true,
    config: { MIN_POSITIONS: 3, EXCLUDED_NAVSTATUS: [] },
    tickIntervalMs: null,
  },
  {
    id: 'dark',
    domain: 'surveillance',
    methodIds: ['dark.ais_gap'],
    alertTypes: ['dark'],
    enabled: true,
    config: {
      GAP_MIN: 30,
      MIN_SOG_KN: 1,
      HARBOUR_DISTANCE_KM: 5,
      HARBOUR_ZONE_KINDS: ['port', 'anchorage'],
      MAX_GAP_H: 24,
      CHECK_INTERVAL_S: 60,
    },
    tickIntervalMs: 60_000,
  },
  {
    id: 'geofence',
    domain: 'surveillance',
    methodIds: ['geo.geofence_enter'],
    alertTypes: ['geofence'],
    enabled: true,
    config: {
      KINDS: ['restricted', 'mpa', 'custom'],
      CRITICAL_KINDS: ['restricted'],
      USE_BUFFER: true,
    },
    tickIntervalMs: null,
  },
  {
    id: 'fishing',
    domain: 'surveillance',
    methodIds: ['fishing.loitering'],
    alertTypes: ['fishing'],
    enabled: true,
    config: {
      ZONE_KINDS: ['fishing_ground', 'restricted'],
      MIN_SOG_KN: 0.5,
      MAX_SOG_KN: 4,
      MIN_DURATION_MIN: 30,
      MIN_POSITIONS: 6,
      MIN_COURSE_CHANGE_DEG_PER_MIN: 3,
    },
    tickIntervalMs: null,
  },
];

let data = buildData();
let violations = buildViolations();

const isAuthority = (claims) => {
  const roles = claims?.roles ?? [];
  return roles.includes('authority') || roles.includes('super_admin');
};

/** spec §8.5: authority/super_admin see everything; others only their fleet's vessels. */
function visible(claims, event) {
  if (isAuthority(claims)) return true;
  if (!claims?.org) return false;
  return (
    FLEET_MMSIS.has(event.mmsi) ||
    (event.relatedMmsi !== null && FLEET_MMSIS.has(event.relatedMmsi))
  );
}

function parseRange(url, defaultDays = 30) {
  const toText = url.searchParams.get('to');
  const fromText = url.searchParams.get('from');
  const to = toText ? Date.parse(toText) : Date.now();
  const from = fromText ? Date.parse(fromText) : to - defaultDays * DAY;
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [
        { field: Number.isNaN(from) ? 'from' : 'to', message: 'must be an ISO-8601 date-time' },
      ],
    });
  }
  if (to - from > 366 * DAY) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'from', message: 'range must not exceed 366 days' }],
    });
  }
  return { from, to };
}

function parseBBox(url) {
  const text = url.searchParams.get('bbox');
  if (!text) return null;
  const parts = text.split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'bbox', message: 'minLon,minLat,maxLon,maxLat' }],
    });
  }
  return parts;
}

const inBBox = (bbox, lat, lon) =>
  !bbox ||
  (lat !== null &&
    lon !== null &&
    lon >= bbox[0] &&
    lat >= bbox[1] &&
    lon <= bbox[2] &&
    lat <= bbox[3]);

function filteredEvents(url, claims) {
  const { from, to } = parseRange(url);
  const bbox = parseBBox(url);
  const type = url.searchParams.get('type');
  const severity = url.searchParams.get('severity');
  const status = url.searchParams.get('status');
  const mmsi = url.searchParams.get('mmsi');
  return data.events.filter((event) => {
    const time = Date.parse(event.time);
    return (
      visible(claims, event) &&
      time >= from &&
      time <= to &&
      (!type || event.type === type) &&
      (!severity || event.currentSeverity === severity) &&
      (!status || event.status === status) &&
      (!mmsi || event.mmsi === Number(mmsi) || event.relatedMmsi === Number(mmsi)) &&
      inBBox(bbox, event.lat, event.lon)
    );
  });
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

/** Synthetic raw track of one vessel: approaches the meeting point, drifts alongside, leaves. */
function syntheticTrack(mmsi, { from, to, meet, windowStart, windowEnd, side }) {
  const points = [];
  const step = 2 * MINUTE;
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    let lat;
    let lon;
    let sog;
    if (t < windowStart) {
      const f = (windowStart - t) / HOUR;
      lat = meet.lat + side * 0.0004 + side * f * 0.05;
      lon = meet.lon - f * 0.07 * side;
      sog = 9 - Math.min(7, (1 - f) * 8);
    } else if (t <= windowEnd) {
      const f = (t - windowStart) / Math.max(1, windowEnd - windowStart);
      lat = meet.lat + side * 0.0002 + f * 0.003;
      lon = meet.lon + f * 0.004;
      sog = 1.1;
    } else {
      const f = (t - windowEnd) / HOUR;
      lat = meet.lat + 0.003 - side * f * 0.06;
      lon = meet.lon + 0.004 + f * 0.08;
      sog = 2 + Math.min(9, f * 14);
    }
    points.push({
      time: iso(t),
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      sog: Number(sog.toFixed(1)),
      cog: side > 0 ? 95 : 265,
      hdg: side > 0 ? 96 : 264,
      navstatus: 0,
      predictedNavstatus: 0,
      source: 'batam',
    });
  }
  return {
    mmsi,
    from: iso(from),
    to: iso(to),
    resolution: 'raw',
    simplifyM: null,
    truncated: false,
    remainingTo: null,
    points,
  };
}

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/surveillance/events',
    permission: 'surveillance:read',
    handler: ({ url, claims, send }) => send(200, cursorPageOf(filteredEvents(url, claims), url)),
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/events/:id',
    permission: 'surveillance:read',
    handler: ({ params, claims, send }) => {
      const event = data.events.find((item) => item.id === params.id);
      if (!event || !visible(claims, event)) {
        throw new MockHttpError(
          404,
          'SURVEILLANCE_EVENT_NOT_FOUND',
          'Surveillance event not found',
          {
            detail: `No visible event ${params.id}`,
          },
        );
      }
      send(200, event);
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/surveillance/events/:id',
    permission: 'surveillance:review',
    handler: async ({ params, claims, body, send }) => {
      const event = data.events.find((item) => item.id === params.id);
      if (!event || !visible(claims, event)) {
        throw new MockHttpError(
          404,
          'SURVEILLANCE_EVENT_NOT_FOUND',
          'Surveillance event not found',
        );
      }
      const input = await body();
      const errors = [];
      if (!['open', 'confirmed', 'dismissed'].includes(input.status)) {
        errors.push({
          field: 'status',
          message: 'status must be one of open, confirmed, dismissed',
        });
      }
      if (
        'note' in input &&
        input.note !== null &&
        (typeof input.note !== 'string' || input.note.length > 2000)
      ) {
        errors.push({
          field: 'note',
          message: 'note must be a string of at most 2000 characters or null',
        });
      }
      if (errors.length)
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', { errors });
      event.status =
        input.status === 'open' && event.resolvedAt !== null ? 'resolved' : input.status;
      if ('note' in input) event.note = input.note;
      event.reviewedBy = claims.sub;
      event.reviewedAt = new Date().toISOString();
      for (const result of data.results)
        if (result.eventId === event.id) result.status = event.status;
      send(200, event);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/transhipments',
    permission: 'surveillance:read',
    handler: ({ url, claims, send }) => {
      const { from, to } = parseRange(url);
      const mmsi = url.searchParams.get('mmsi');
      const items = data.results.filter((result) => {
        const start = Date.parse(result.startTimestamp);
        const event = data.events.find((item) => item.id === result.eventId);
        return (
          (!event || visible(claims, event)) &&
          start >= from &&
          start <= to &&
          (!mmsi || result.ship1MMSI === Number(mmsi) || result.ship2MMSI === Number(mmsi))
        );
      });
      send(200, cursorPageOf(items, url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/heatmap',
    permission: 'surveillance:read',
    handler: ({ url, claims, send }) => {
      const { from, to } = parseRange(url);
      const bbox = parseBBox(url);
      const type = url.searchParams.get('type');
      const cellKm = Number(url.searchParams.get('cellKm') ?? 10);
      if (!(cellKm >= 0.5 && cellKm <= 500)) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'cellKm', message: 'must be between 0.5 and 500' }],
        });
      }
      const cellDeg = cellKm / 111.32;
      const cells = new Map();
      let total = 0;
      for (const event of data.events) {
        const time = Date.parse(event.time);
        if (!visible(claims, event) || time < from || time > to || (type && event.type !== type))
          continue;
        if (event.lat === null || event.lon === null || !inBBox(bbox, event.lat, event.lon))
          continue;
        const lat = Math.round(event.lat / cellDeg) * cellDeg;
        const lon = Math.round(event.lon / cellDeg) * cellDeg;
        const key = `${lat.toFixed(5)}:${lon.toFixed(5)}`;
        const cell = cells.get(key) ?? {
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
          count: 0,
        };
        cell.count += 1;
        cells.set(key, cell);
        total += 1;
      }
      send(200, {
        cells: [...cells.values()],
        cellKm,
        cellDeg,
        from: iso(from),
        to: iso(to),
        total,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/fishing-violations',
    permission: 'surveillance:read',
    handler: ({ url, send }) => {
      const year = url.searchParams.get('year');
      const bbox = parseBBox(url);
      const items = violations.filter(
        (item) => (!year || item.year === Number(year)) && inBBox(bbox, item.lat, item.lon),
      );
      send(200, pageOf(items, url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/stats',
    permission: 'surveillance:read',
    handler: ({ url, claims, send }) => {
      const { from, to } = parseRange(url);
      const events = data.events.filter((event) => {
        const time = Date.parse(event.time);
        return visible(claims, event) && time >= from && time <= to;
      });
      send(200, {
        from: iso(from),
        to: iso(to),
        total: events.length,
        active: events.filter((event) => event.resolvedAt === null).length,
        byType: countBy(events, 'type'),
        bySeverity: countBy(events, 'currentSeverity'),
        byStatus: countBy(events, 'status'),
        transhipmentQueue: isAuthority(claims)
          ? { pending: 4, inProgress: 1, completed: 37, failed: 0 }
          : null,
        fishingViolations: violations.length,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/surveillance/detectors',
    permission: 'surveillance:read',
    handler: ({ send }) => send(200, DETECTORS),
  },
  {
    // ais-processor; RegExp = fallback (a literal route of another module wins).
    method: 'GET',
    path: /^\/api\/v2\/ais\/pairs\/track$/,
    permission: 'ais:read',
    handler: ({ url, send }) => {
      const mmsi1 = Number(url.searchParams.get('mmsi1'));
      const mmsi2 = Number(url.searchParams.get('mmsi2'));
      if (!(mmsi1 >= 100000000 && mmsi1 <= 999999999 && mmsi2 >= 100000000 && mmsi2 <= 999999999)) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'mmsi1', message: 'mmsi1 and mmsi2 must be 9-digit MMSIs' }],
        });
      }
      const { from, to } = parseRange(url, 1);
      const event = data.events.find(
        (item) =>
          item.type === 'transhipment' &&
          Math.min(mmsi1, mmsi2) === item.mmsi &&
          Math.max(mmsi1, mmsi2) === item.relatedMmsi,
      );
      const meet = event ? { lat: event.lat, lon: event.lon } : { lat: 1.13, lon: 103.9 };
      const windowStart = event ? Date.parse(event.data.startTimestamp) : from + (to - from) / 3;
      const windowEnd = event ? Date.parse(event.data.endTimestamp) : from + ((to - from) * 2) / 3;
      const options = { from, to, meet, windowStart, windowEnd };
      send(200, {
        from: iso(from),
        to: iso(to),
        tracks: [
          syntheticTrack(mmsi1, { ...options, side: 1 }),
          syntheticTrack(mmsi2, { ...options, side: -1 }),
        ],
      });
    },
  },
];

export function reset() {
  data = buildData();
  violations = buildViolations();
}
