// Live data of the map and dashboard: AIS processor (spec §13.2) and safety states (§13.7).
import { nowIso, vesselId, VESSELS } from '../lib.mjs';

export function latestPositions() {
  return VESSELS.map(([mmsi, name, typeCode, lat, lon, hdg, sog], index) => ({
    mmsi,
    time: nowIso(),
    lat,
    lon,
    sog,
    cog: hdg,
    hdg,
    navstatus: sog < 1 ? 1 : 0,
    predictedNavstatus: 0,
    source: index % 3 === 0 ? 'batam' : 'primary',
    vessel: { id: vesselId(mmsi), name, typeCode },
  }));
}

function safetyStates() {
  const state = (mmsi, lat, lon, ewsStatus, collisionRisk, closestEncounter = null) => ({
    mmsi,
    time: nowIso(),
    lat,
    lon,
    ewsStatus,
    collisionRisk,
    closestEncounter,
  });
  return [
    state(525005223, 1.152, 103.902, 0, 'none'),
    state(525019004, 1.131, 103.87, 1, 'none'),
    state(525019002, 1.118, 103.79, 3, 'high', { otherMmsi: 563012345, cpaNm: 0.35, tcpaMin: 6.5 }),
    state(563012345, 1.182, 103.74, 3, 'medium', {
      otherMmsi: 525019002,
      cpaNm: 0.35,
      tcpaMin: 6.5,
    }),
  ];
}

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/ais/latest',
    handler: ({ send }) => send(200, latestPositions()),
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
  {
    method: 'GET',
    path: '/api/v2/safety/vessels',
    handler: ({ send }) => send(200, safetyStates()),
  },
];
