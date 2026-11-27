// AIS processor (spec §13.2): latest positions of the demo vessels (REST seed of the live map,
// spec §9), one vessel's latest position and the dashboard's platform statistics. The realtime
// hook records the positions as the latest known state (sent on `vessel:subscribe`); with
// MOCK_REALTIME_SIMULATE=true the vessels also move (30x time-lapse) and stream `positions`
// batches every second — handy with `pnpm dev`, off in e2e runs so maps stay deterministic.
import { MockHttpError, nowIso, vesselId, VESSELS } from '../lib.mjs';

const SIMULATE = process.env.MOCK_REALTIME_SIMULATE === 'true';
const TIME_LAPSE = 30;

/** Mutable state of the simulation: [lat, lon] per demo vessel. */
let tracks = VESSELS.map(([, , , lat, lon]) => [lat, lon]);

/** `VesselLatestDto[]` of the demo vessels (newest first, like the service). */
export function latestPositions() {
  const time = nowIso();
  return VESSELS.map(([mmsi, name, typeCode, , , hdg, sog], index) => ({
    mmsi,
    time,
    lat: tracks[index][0],
    lon: tracks[index][1],
    sog,
    cog: hdg,
    hdg,
    navstatus: sog < 1 ? 1 : 0,
    predictedNavstatus: 0,
    source: index % 3 === 0 ? 'batam' : 'primary',
    vessel: { id: vesselId(mmsi), name, typeCode },
  }));
}

/** `minLon,minLat,maxLon,maxLat` of the query, or null. */
function bboxOf(url) {
  const parts = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

function step(seconds) {
  tracks = tracks.map(([lat, lon], index) => {
    const [, , , , , hdg, sog] = VESSELS[index];
    const nm = (sog * seconds) / 3600;
    const rad = (hdg * Math.PI) / 180;
    return [
      lat + (nm / 60) * Math.cos(rad),
      lon + (nm / 60) * (Math.sin(rad) / Math.cos((lat * Math.PI) / 180)),
    ];
  });
}

export function reset() {
  tracks = VESSELS.map(([, , , lat, lon]) => [lat, lon]);
}

/** @type {import('../lib.mjs').MockRealtimeHooks} */
export const realtime = {
  start(rt) {
    rt.positions(latestPositions());
    if (!SIMULATE) return undefined;
    return rt.every(1_000, () => {
      step(TIME_LAPSE);
      rt.positions(latestPositions());
    });
  },
};

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/ais/latest',
    handler: ({ url, send }) => {
      const bbox = bboxOf(url);
      const limit = Number(url.searchParams.get('limit') ?? 10_000);
      // `mmsi=a,b,c`: batch lookup of up to 100 vessels ("last seen" of the fleet list).
      const only = url.searchParams.get('mmsi')?.split(',').map(Number) ?? null;
      const inside = latestPositions().filter(
        ({ lat, lon, mmsi }) =>
          (!only || only.includes(mmsi)) &&
          (!bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3])),
      );
      send(200, inside.slice(0, limit), inside.length > limit ? { 'X-Truncated': 'true' } : {});
    },
  },
  {
    method: 'GET',
    path: '/api/v2/ais/vessels/:mmsi/latest',
    handler: ({ params, send, problem }) => {
      const position = latestPositions().find((p) => String(p.mmsi) === params.mmsi);
      if (!position) {
        return problem(404, 'AIS_POSITION_NOT_FOUND', 'AIS position not found', {
          detail: `No position of MMSI ${params.mmsi}`,
        });
      }
      return send(200, position);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/ais/stats/series',
    permission: 'ais:read',
    handler: ({ url, send }) => send(200, trafficSeries(url)),
  },
  {
    method: 'GET',
    path: '/api/v2/ais/stats',
    handler: ({ send }) =>
      send(200, {
        activeVessels: VESSELS.length,
        messagesLastMinute: 128,
        bySource: {
          primary: { activeVessels: 9, messagesLastMinute: 84 },
          batam: { activeVessels: 5, messagesLastMinute: 44 },
          pusher: { activeVessels: 0, messagesLastMinute: 0 },
        },
        activeWindowMinutes: 30,
        at: nowIso(),
      }),
  },
];

const BUCKET_MINUTES = { '1m': 1, '5m': 5, '1h': 60 };

/** `GET /ais/stats/series`: deterministic traffic around the current rates (84 + 44 per minute). */
function trafficSeries(url) {
  const q = url.searchParams;
  const bucket = q.get('bucket') ?? '5m';
  const minutes = BUCKET_MINUTES[bucket];
  if (!minutes) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'bucket', message: 'bucket must be one of 1m, 5m, 1h' }],
    });
  }
  const size = minutes * 60_000;
  const to = q.get('to') ? Date.parse(q.get('to')) : Date.now();
  const from = q.get('from') ? Date.parse(q.get('from')) : to - 24 * 60 * 60_000;
  const first = Math.floor(from / size) * size;
  const points = [];
  for (let at = first; at < to; at += size) {
    const wave = 1 + 0.18 * Math.sin(at / 3_600_000) + 0.06 * Math.sin(at / 420_000);
    const samples = Math.max(1, Math.min(minutes, Math.ceil((to - at) / 60_000)));
    const primary = Math.round(84 * wave * samples);
    const batam = Math.round(44 * (2 - wave) * samples);
    points.push({
      at: new Date(at).toISOString(),
      samples,
      messages: primary + batam,
      activeVessels: VESSELS.length,
      bySource: {
        primary: { messages: primary, activeVessels: 9 },
        batam: { messages: batam, activeVessels: 5 },
        pusher: { messages: 0, activeVessels: 0 },
      },
    });
  }
  return {
    from: new Date(first).toISOString(),
    to: new Date(to).toISOString(),
    bucket,
    bucketMinutes: minutes,
    activeWindowMinutes: 30,
    points,
  };
}
