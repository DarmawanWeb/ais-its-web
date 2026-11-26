// Empty example of a feature mock module: copy it to routes/<feature>.mjs (the feature id, e.g.
// routes/zones.mjs) and fill it in — see README.md next to this file. Files whose name starts
// with "_" are not loaded. Every export is optional (a module needs at least one of them).
//
// import { MockHttpError, nowIso, pageOf } from '../lib.mjs';

/** Module state lives here; `reset()` restores it (POST /__mock/reset, `resetMockGateway()`). */
// const INITIAL_ZONES = [{ id: '0192f0c8-…', name: 'Pipa Gas Batam', … }];
// let zones = structuredClone(INITIAL_ZONES);

/** HTTP endpoints; shapes follow src/shared/api/generated/<service>/model. */
/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  // {
  //   method: 'GET',
  //   path: '/api/v2/zones',
  //   permission: 'zone:read', // 403 problem details without it (super_admin has all)
  //   handler: ({ url, send }) => send(200, pageOf(zones, url)), // { data, meta }
  // },
  // {
  //   method: 'PATCH',
  //   path: '/api/v2/zones/:id', // params.id, URI-decoded; literal segments win over :params
  //   permission: 'zone:write',
  //   handler: async ({ params, body, send, realtime }) => {
  //     const zone = zones.find((z) => z.id === params.id);
  //     if (!zone) throw new MockHttpError(404, 'ZONE_NOT_FOUND', 'Zone not found');
  //     Object.assign(zone, await body(), { updatedAt: nowIso() });
  //     send(200, zone);
  //   },
  // },
];

/** Hooks on the mock socket.io server (/ws, spec §9); `rt` is the MockRealtime API. */
/** @type {import('../lib.mjs').MockRealtimeHooks} */
export const realtime = {
  // start(rt) {
  //   // once at start-up; return a cleanup (rt.every returns its stop function)
  //   return rt.every(1_000, () => rt.safetyStates([…])); // `safety:states` per tile room
  // },
  // viewport({ socket, bbox, rooms, rt }) {}, // after an acknowledged viewport:set
  // subscribe({ socket, mmsi, rt }) {}, // after vessel:subscribe (latest state already sent)
  // connection({ socket, claims, rt }) {}, // every authenticated connection
};

export function reset() {
  // zones = structuredClone(INITIAL_ZONES);
}
