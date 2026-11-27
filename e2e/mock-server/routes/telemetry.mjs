// Telemetry service mock (spec §13.4, services/telemetry/README.md): synthetic fuel readings every
// 10 minutes for the organization's vessels with devices (deterministic per MMSI and time), raw
// and 1h/1d series as cursor pages, summaries, status ("active" within 10 min), the vessel
// overview, and manual entry with the service's rules (≥ 0, maxima, 5 min skew, one reading per
// vessel and instant → 409 READING_CONFLICT). The device list is a RegExp fallback so a
// devices module of the admin page with plain paths takes precedence.
import { cursorPageOf, MockHttpError, pageOf } from '../lib.mjs';
import { vesselRecord, vesselsOfOrg } from './vessels.mjs';

const STEP = 600_000; // 10 minutes
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ACTIVE_WINDOW_MIN = 10;
const MAX_ME = 500;
const MAX_AE = 100;

/** Vessels with fuel meters: every own vessel in service except one in four. */
const hasTelemetry = (vessel) => vessel.status === 'active' && vessel.mmsi % 4 !== 3;

const deviceIdOf = (mmsi, n = 1) =>
  `0192f0c8-7d3a-7c2e-9a1e-${String(mmsi).slice(-9).padStart(10, '0')}${String(n).padStart(2, '0')}`;

/** Pseudo-random in [0, 1) from integers (stable across runs). */
function noise(a, b) {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Synthetic reading of a vessel at a 10-minute instant (ME/AE tonnes burnt in 10 minutes). */
function generated(mmsi, time) {
  const hour = (time / HOUR) % 24;
  const phase = (mmsi % 7) / 7;
  const load =
    0.6 + 0.35 * Math.sin(2 * Math.PI * (hour / 24 + phase)) + 0.25 * noise(mmsi, time / STEP);
  const base = 0.018 + (mmsi % 5) * 0.004;
  return {
    time: new Date(time).toISOString(),
    periodStart: new Date(time - STEP).toISOString(),
    fuelMeTon: round(Math.max(base * load, 0)),
    fuelAeTon: round(0.003 + 0.0015 * noise(time / STEP, mmsi)),
    source: 'mqtt',
    deviceId: deviceIdOf(mmsi),
  };
}

/** Manual readings per MMSI: Map<time ms, reading>. */
let manual = new Map();

export function reset() {
  manual = new Map();
}

function rawReadings(vessel, from, to) {
  const out = [];
  if (hasTelemetry(vessel)) {
    const start = Math.ceil(from / STEP) * STEP;
    const end = Math.min(to, Math.floor(Date.now() / STEP) * STEP + 1);
    for (let time = start; time < end; time += STEP) out.push(generated(vessel.mmsi, time));
  }
  for (const [time, reading] of manual.get(vessel.mmsi) ?? []) {
    if (time >= from && time < to) out.push(reading);
  }
  return out.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function bucketed(readings, size) {
  const buckets = new Map();
  for (const reading of readings) {
    const start = Math.floor(Date.parse(reading.time) / size) * size;
    const bucket = buckets.get(start) ?? {
      time: new Date(start).toISOString(),
      fuelMeTon: 0,
      fuelAeTon: 0,
      readings: 0,
    };
    bucket.fuelMeTon += reading.fuelMeTon;
    bucket.fuelAeTon += reading.fuelAeTon;
    bucket.readings += 1;
    buckets.set(start, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    fuelMeTon: round(bucket.fuelMeTon, 6),
    fuelAeTon: round(bucket.fuelAeTon, 6),
    totalFuelTon: round(bucket.fuelMeTon + bucket.fuelAeTon, 6),
    periodStart: null,
    source: null,
    deviceId: null,
  }));
}

const point = (reading) => ({
  time: reading.time,
  fuelMeTon: reading.fuelMeTon,
  fuelAeTon: reading.fuelAeTon,
  totalFuelTon: round(reading.fuelMeTon + reading.fuelAeTon, 6),
  readings: 1,
  periodStart: reading.periodStart,
  source: reading.source,
  deviceId: reading.deviceId,
});

const readingDto = (mmsi, reading) => ({
  mmsi,
  ...reading,
  totalFuelTon: round(reading.fuelMeTon + reading.fuelAeTon, 6),
  receivedAt: reading.time,
});

/** The vessel of a telemetry request: known and owned by the caller's organization (§8.5). */
function ownVessel(claims, mmsi) {
  if (!/^\d{9}$/.test(String(mmsi))) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'mmsi', message: 'mmsi must be 9 digits' }],
    });
  }
  const vessel = vesselRecord(mmsi);
  if (!vessel)
    throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found', {
      detail: `No vessel with MMSI ${mmsi}`,
    });
  const admin = (claims?.roles ?? []).includes('super_admin');
  if (!admin && vessel.orgId !== claims?.org)
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
  return vessel;
}

function rangeOf(url, defaultMs, maxMs) {
  const to = url.searchParams.get('to') ? Date.parse(url.searchParams.get('to')) : Date.now();
  const from = url.searchParams.get('from')
    ? Date.parse(url.searchParams.get('from'))
    : to - defaultMs;
  if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'from', message: 'from must be before to' }],
    });
  }
  if (maxMs && to - from > maxMs) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'from', message: 'range too long for the bucket' }],
    });
  }
  return { from, to };
}

function latestOf(vessel) {
  const readings = rawReadings(vessel, Date.now() - 2 * DAY, Date.now() + 1);
  return readings.at(-1) ?? null;
}

const statusOf = (vessel) => {
  const last = latestOf(vessel);
  return {
    mmsi: vessel.mmsi,
    active: Boolean(last && Date.now() - Date.parse(last.time) <= ACTIVE_WINDOW_MIN * 60_000),
    lastReadingAt: last?.time ?? null,
    activeWindowMin: ACTIVE_WINDOW_MIN,
    lastReading: last ? readingDto(vessel.mmsi, last) : null,
  };
};

const devicesOf = (vessel) =>
  hasTelemetry(vessel)
    ? [
        {
          id: deviceIdOf(vessel.mmsi),
          orgId: vessel.orgId,
          mmsi: vessel.mmsi,
          name: `Flowmeter ME/AE ${vessel.name}`,
          kind: 'mqtt',
          apiKeyId: null,
          status: 'active',
          serialNumber: `FM-${String(vessel.mmsi).slice(-5)}`,
          mqttTopic: `aisits/telemetry/${deviceIdOf(vessel.mmsi)}`,
          lastSeenAt: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
          vesselName: vessel.name,
          lastReadingAt: statusOf(vessel).lastReadingAt,
          connectionState: statusOf(vessel).active ? 'online' : 'idle',
          activeWindowMin: ACTIVE_WINDOW_MIN,
          offlineAfterMin: 1440,
          createdBy: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      ]
    : [];

function validateReading(input, index, claims, now) {
  const errors = [];
  const field = (name) => `${index}.${name}`;
  let vessel = null;
  try {
    vessel = ownVessel(claims, input?.mmsi);
  } catch (error) {
    if (error.code === 'VALIDATION_FAILED')
      errors.push({ field: field('mmsi'), message: 'mmsi must be 9 digits' });
    else throw error;
  }
  const time = Date.parse(input?.time);
  if (Number.isNaN(time))
    errors.push({ field: field('time'), message: 'time must be an ISO-8601 timestamp' });
  else if (time > now + 5 * 60_000)
    errors.push({ field: field('time'), message: 'time is more than 5 minutes ahead' });
  for (const [name, max] of [
    ['fuelMeTon', MAX_ME],
    ['fuelAeTon', MAX_AE],
  ]) {
    const value = input?.[name];
    if (typeof value !== 'number' || !Number.isFinite(value))
      errors.push({ field: field(name), message: `${name} must be a number` });
    else if (value < 0)
      errors.push({ field: field(name), message: `${name} must not be negative` });
    else if (value > max)
      errors.push({ field: field(name), message: `${name} must not be greater than ${max}` });
  }
  if (input?.periodStart !== undefined && input.periodStart !== null) {
    const start = Date.parse(input.periodStart);
    if (Number.isNaN(start) || start >= time)
      errors.push({ field: field('periodStart'), message: 'periodStart must be before time' });
    else if (time - start > 24 * HOUR)
      errors.push({ field: field('periodStart'), message: 'period longer than 24 hours' });
  }
  return { vessel, time, errors };
}

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels',
    permission: 'telemetry:read',
    handler: ({ url, claims, send }) => {
      if (!claims?.org)
        throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'Organization required');
      const items = vesselsOfOrg(claims.org)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((vessel) => {
          const status = statusOf(vessel);
          return {
            mmsi: vessel.mmsi,
            vesselId: vessel.id,
            orgId: vessel.orgId,
            name: vessel.name,
            status: vessel.status,
            lastReadingAt: status.lastReadingAt,
            active: status.active,
            devices: devicesOf(vessel).length,
          };
        });
      send(200, pageOf(items, url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels/:mmsi/readings',
    permission: 'telemetry:read',
    handler: ({ url, params, claims, send }) => {
      const vessel = ownVessel(claims, params.mmsi);
      const bucket = url.searchParams.get('bucket') ?? 'raw';
      if (!['raw', '1h', '1d'].includes(bucket)) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'bucket', message: 'raw, 1h or 1d' }],
        });
      }
      const defaults = {
        raw: [DAY, 31 * DAY],
        '1h': [7 * DAY, 366 * DAY],
        '1d': [365 * DAY, 5 * 366 * DAY],
      }[bucket];
      const { from, to } = rangeOf(url, defaults[0], defaults[1]);
      const raw = rawReadings(vessel, from, to);
      const series =
        bucket === 'raw' ? raw.map(point) : bucketed(raw, bucket === '1h' ? HOUR : DAY);
      const order = url.searchParams.get('order') ?? 'asc';
      if (!['asc', 'desc'].includes(order)) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'order', message: 'asc or desc' }],
        });
      }
      send(200, cursorPageOf(order === 'desc' ? series.reverse() : series, url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels/:mmsi/readings.csv',
    permission: 'telemetry:read',
    handler: ({ url, params, claims, send }) => {
      const vessel = ownVessel(claims, params.mmsi);
      const bucket = url.searchParams.get('bucket') ?? 'raw';
      const defaults = {
        raw: [DAY, 31 * DAY],
        '1h': [7 * DAY, 366 * DAY],
        '1d': [365 * DAY, 5 * 366 * DAY],
      }[bucket];
      if (!defaults) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'bucket', message: 'raw, 1h or 1d' }],
        });
      }
      const { from, to } = rangeOf(url, defaults[0], defaults[1]);
      const raw = rawReadings(vessel, from, to);
      const series =
        bucket === 'raw' ? raw.map(point) : bucketed(raw, bucket === '1h' ? HOUR : DAY);
      const cell = (value) => (value === null || value === undefined ? '' : String(value));
      const lines = [
        'time,periodStart,fuelMeTon,fuelAeTon,totalFuelTon,readings,source,deviceId',
        ...series.map((p) =>
          [
            p.time,
            p.periodStart,
            p.fuelMeTon,
            p.fuelAeTon,
            p.totalFuelTon,
            p.readings,
            p.source,
            p.deviceId,
          ]
            .map(cell)
            .join(','),
        ),
      ];
      const day = (time) => new Date(time).toISOString().slice(0, 10);
      send(200, `${lines.join('\r\n')}\r\n`, {
        'Content-Type': 'text/csv; charset=utf-8; header=present',
        'Content-Disposition': `attachment; filename="telemetry-${vessel.mmsi}-${bucket}-${day(from)}_${day(to)}.csv"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels/:mmsi/devices',
    permission: 'telemetry:read',
    handler: ({ url, params, claims, send }) => {
      const vessel = ownVessel(claims, params.mmsi);
      const items = devicesOf(vessel).map(({ id, name, kind, status, lastSeenAt }) => ({
        id,
        name,
        kind,
        status,
        lastSeenAt,
      }));
      send(200, pageOf(items, url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels/:mmsi/summary',
    permission: 'telemetry:read',
    handler: ({ url, params, claims, send }) => {
      const vessel = ownVessel(claims, params.mmsi);
      const { from, to } = rangeOf(url, 30 * DAY, 0);
      const raw = rawReadings(vessel, from, to);
      const me = raw.reduce((sum, r) => sum + r.fuelMeTon, 0);
      const ae = raw.reduce((sum, r) => sum + r.fuelAeTon, 0);
      send(200, {
        mmsi: vessel.mmsi,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        readings: raw.length,
        fuelMeTon: round(me, 6),
        fuelAeTon: round(ae, 6),
        totalFuelTon: round(me + ae, 6),
        firstReadingAt: raw[0]?.time ?? null,
        lastReadingAt: raw.at(-1)?.time ?? null,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/vessels/:mmsi/status',
    permission: 'telemetry:read',
    handler: ({ params, claims, send }) => send(200, statusOf(ownVessel(claims, params.mmsi))),
  },
  {
    method: 'POST',
    path: '/api/v2/telemetry/readings',
    permission: 'telemetry:write',
    handler: async ({ url, claims, body, send }) => {
      const payload = await body();
      const inputs = Array.isArray(payload) ? payload : [payload];
      if (inputs.length === 0 || inputs.length > 1000) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: '(body)', message: '1–1000 readings' }],
        });
      }
      const now = Date.now();
      const checked = inputs.map((input, index) => validateReading(input, index, claims, now));
      const errors = checked.flatMap((entry) => entry.errors);
      if (errors.length)
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', { errors });
      const source = url.searchParams.get('source') === 'import' ? 'import' : 'manual';
      let accepted = 0;
      let duplicates = 0;
      const conflicts = [];
      checked.forEach(({ vessel, time }, index) => {
        const input = inputs[index];
        const existing =
          manual.get(vessel.mmsi)?.get(time) ??
          (hasTelemetry(vessel) && time % STEP === 0 && time <= now
            ? generated(vessel.mmsi, time)
            : null);
        if (!existing) return;
        const same =
          existing.fuelMeTon === input.fuelMeTon &&
          existing.fuelAeTon === input.fuelAeTon &&
          (existing.periodStart ?? null) === (input.periodStart ?? null) &&
          existing.deviceId === null;
        if (same) duplicates += 1;
        else
          conflicts.push({
            field: `${index}.time`,
            message: 'a different reading exists at this time',
            code: 'reading_conflict',
          });
      });
      if (conflicts.length) {
        throw new MockHttpError(409, 'READING_CONFLICT', 'Reading conflict', {
          detail: 'A vessel has a different reading at one of the times already',
          errors: conflicts,
        });
      }
      checked.forEach(({ vessel, time }, index) => {
        const input = inputs[index];
        const byTime = manual.get(vessel.mmsi) ?? new Map();
        if (byTime.has(time)) return;
        byTime.set(time, {
          time: new Date(time).toISOString(),
          periodStart: input.periodStart ?? null,
          fuelMeTon: input.fuelMeTon,
          fuelAeTon: input.fuelAeTon,
          source,
          deviceId: null,
        });
        manual.set(vessel.mmsi, byTime);
        accepted += 1;
      });
      send(202, { received: inputs.length, accepted, duplicates, published: accepted });
    },
  },
  {
    // Device registry (fallback for the admin devices page, see the header).
    method: 'GET',
    path: /^\/api\/v2\/telemetry\/devices\/?$/,
    permission: 'device:manage',
    handler: ({ url, claims, send }) => {
      const mmsi = url.searchParams.get('mmsi');
      const vessels = mmsi ? [ownVessel(claims, mmsi)] : vesselsOfOrg(claims?.org);
      send(200, pageOf(vessels.flatMap(devicesOf), url));
    },
  },
];
