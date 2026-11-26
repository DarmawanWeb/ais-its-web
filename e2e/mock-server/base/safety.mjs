// Safety service (spec §13.7): latest safety states (`SafetyVesselStateDto`), the REST seed of
// the live map's safety rings (spec §9). The realtime hook records them as the latest known
// states (sent on `vessel:subscribe`). The safety feature may override these routes.
import { nowIso, vesselId, VESSELS } from '../lib.mjs';

const PIPELINE_ZONE_ID = '0192f0c8-7d3a-7c2e-9a1d-000000000001';

/**
 * [mmsi, ewsStatus (0 danger, 1 warning, 3 safe), pipelineDistanceM, collisionRisk,
 * closestEncounter]: one vessel per safety ring style of the map legend.
 */
const STATES = [
  [525005223, 0, 95, 'none', null],
  [525019004, 1, 420, 'none', null],
  [525019002, 3, 1850, 'high', { otherMmsi: 563012345, cpaNm: 0.35, tcpaMin: 6.5 }],
  [563012345, 3, null, 'medium', { otherMmsi: 525019002, cpaNm: 0.35, tcpaMin: 6.5 }],
];

/** `SafetyVesselStateDto[]` of the demo vessels with a safety state. */
export function safetyStates() {
  const time = nowIso();
  return STATES.map(([mmsi, ewsStatus, pipelineDistanceM, collisionRisk, closestEncounter]) => {
    const [, name, , lat, lon, hdg, sog] = VESSELS.find(([m]) => m === mmsi);
    return {
      mmsi,
      time,
      lat,
      lon,
      positionTime: time,
      sog,
      cog: hdg,
      hdg,
      navstatus: 0,
      predictedNavstatus: 0,
      ewsStatus,
      pipelineDistanceM,
      nearestPipelineZoneId: pipelineDistanceM === null ? null : PIPELINE_ZONE_ID,
      collisionRisk,
      closestEncounter,
      methodIds: ['ews.pipeline_distance_status', 'collision.cpa_tcpa'],
      vessel: { id: vesselId(mmsi), name },
      updatedAt: time,
    };
  });
}

/** @type {import('../lib.mjs').MockRealtimeHooks} */
export const realtime = {
  start: (rt) => rt.safetyStates(safetyStates()),
};

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/safety/vessels',
    handler: ({ send }) => send(200, safetyStates()),
  },
  {
    method: 'GET',
    path: '/api/v2/safety/vessels/:mmsi',
    handler: ({ params, send, problem }) => {
      const state = safetyStates().find((s) => String(s.mmsi) === params.mmsi);
      if (!state) {
        return problem(404, 'SAFETY_STATE_NOT_FOUND', 'Safety state not found', {
          detail: `No safety state of MMSI ${params.mmsi}`,
        });
      }
      return send(200, state);
    },
  },
];
