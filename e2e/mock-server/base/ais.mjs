// AIS processor (spec §13.2): latest positions of the demo vessels (REST seed of the live map,
// spec §9), one vessel's latest position and the dashboard's platform statistics. The realtime
// hook records the positions as the latest known state (sent on `vessel:subscribe`); with
// MOCK_REALTIME_SIMULATE=true the vessels also move (30x time-lapse) and stream `positions`
// batches every second — handy with `pnpm dev`, off in e2e runs so maps stay deterministic.
import { nowIso, vesselId, VESSELS } from '../lib.mjs';

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
      const inside = latestPositions().filter(
        ({ lat, lon }) =>
          !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]),
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
