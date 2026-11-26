# Mock gateway modules

The mock gateway (`../server.mjs`, `pnpm e2e:mock`, started by Playwright for every e2e run)
serves three layers, matched by method and path:

| Layer       | Files                   | Owner       | Content                                                  |
| ----------- | ----------------------- | ----------- | -------------------------------------------------------- |
| core        | `../server.mjs`         | foundation  | session endpoints (login, refresh, logout, switch-org…)  |
| **feature** | `routes/<feature>.mjs`  | the feature | one module per feature, named after `src/features/<id>/` |
| base        | `../base/<service>.mjs` | foundation  | defaults several features read (list below), overridable |

Base routes: `GET /api/v2/me`, `/organizations`, `/vessels`, `/ais/latest`,
`/ais/vessels/:mmsi/latest`, `/ais/stats`, `/safety/vessels`, `/safety/vessels/:mmsi`,
`/alerts/summary`. Feature modules are loaded automatically; a module whose name is not a
feature id (`src/features/<id>/routes.tsx`) fails at start-up.

A feature route **replaces** the base route with the same method and path (the start-up log
says so), so a feature owns its endpoints without editing foundation files. The same route in
two feature modules, or a feature route on a core endpoint, fails at start-up with both file
names. Files starting with `_` are not loaded: copy [`_example.mjs`](_example.mjs) to start.

## Module exports (all optional, at least one)

```js
import { MockHttpError, nowIso, pageOf } from '../lib.mjs';

let zones = structuredClone(INITIAL_ZONES); // module state

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET', // GET | POST | PUT | PATCH | DELETE
    path: '/api/v2/zones', // exact, `:name` segments or a RegExp with named groups
    permission: 'zone:read', // optional: 403 problem details without it (list = any of)
    handler: ({ url, send }) => send(200, pageOf(zones, url)),
  },
  {
    method: 'PATCH',
    path: '/api/v2/zones/:id', // literal segments win over `:params` (/zones/geojson first)
    permission: 'zone:write',
    handler: async ({ params, body, send }) => {
      const zone = zones.find((z) => z.id === params.id);
      if (!zone) throw new MockHttpError(404, 'ZONE_NOT_FOUND', 'Zone not found');
      Object.assign(zone, await body(), { updatedAt: nowIso() });
      send(200, zone);
    },
  },
];

/** @type {import('../lib.mjs').MockRealtimeHooks} */
export const realtime = {
  start: (rt) => rt.every(1_000, () => rt.safetyStates(currentStates())), // returns a cleanup
};

export function reset() {
  zones = structuredClone(INITIAL_ZONES); // POST /__mock/reset (resetMockGateway())
}
```

- **Handler context**: `req`, `url` (`url.searchParams`), `params`, `claims` (decoded access
  token: `sub`, `org`, `roles`), `user` (demo account), `body()` (parsed JSON), `send(status,
payload, headers)`, `problem(status, code, title, extra)`, `realtime` (push events, e.g.
  `alert:updated` after an acknowledge). Throw `MockHttpError` for problem details; a handler
  that answers nothing becomes a 500 naming the module.
- Routes need an access token unless `public: true` (401 problem details). Unknown `/api/v2/*`
  paths answer 404 problem details, like a service that is not deployed.
- **Shapes** follow the service's `openapi.json` (`src/shared/api/generated/<service>/model`)
  and handbook (`services/<service>/README.md`): page lists `pageOf(items, url)` →
  `{ data, meta }`, cursor lists `cursorPageOf(items, url)` → `{ data, page: { nextCursor,
limit } }` (both reject invalid queries with 400 `VALIDATION_FAILED`), errors with the
  service's codes. `can(claims, permission)` applies the contracts role matrix.
- Demo data and helpers in `../lib.mjs`: `ORGS`, `USERS`, `FLEET_ORG_ID`, `VESSELS`,
  `vesselId()`, `nowIso()`; DTO builders of the base modules (`vesselSummaryOf()` in
  `../base/fleet.mjs`, `latestPositions()` in `../base/ais.mjs`, `safetyStates()` in
  `../base/safety.mjs`) may be imported. Never import another feature's module.

## Realtime (socket.io at `/ws`, spec §9)

`../realtime.mjs` implements the notification gateway: handshake `auth: { token }` (invalid or
expired → `connect_error` `{ code: 'UNAUTHORIZED' }`), rooms `user:<id>`, `org:<id>`,
`authority`, `viewport:set` → zoom-6 tile rooms or `tile:all` (contracts tile math, ack
`{ mode, tileCount }`), `vessel:subscribe` → `vessel:<mmsi>` plus the latest known position and
safety state. It emits nothing by itself. The `MockRealtime` API (`rt` in hooks, `realtime` in
handlers) validates payloads with the contracts schemas:

| Call                                              | Emits                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `rt.positions(items)`                             | `positions` `{ at, items }` per tile room and `tile:all`; `vessel:position` per vessel |
| `rt.safetyStates(items)`                          | `safety:states` and `vessel:safety`, same rooms                                        |
| `rt.alert(alert, { kind, orgIds })`               | `alert:raised` / `alert:updated` to `authority` + `org:<id>` (default `FLEET_ORG_ID`)  |
| `rt.cii(update)`                                  | `cii:updated` to `org:<update.orgId>`                                                  |
| `rt.emit(event, payload, { rooms })`              | anything (no validation)                                                               |
| `rt.every(ms, tick)`, `rt.connections()`, `rt.io` | timers stopped on shutdown, connected sockets and rooms, the socket.io server          |

Hooks: `start(rt)` (once; publishing there only records the latest state), `connection({
socket, claims, rt })`, `viewport({ socket, bbox, zoom, mode, rooms, rt })`, `subscribe({
socket, mmsi, rt })`. Nothing streams on a timer in e2e runs unless a module does it; prefer
pushing from the test (deterministic). `MOCK_REALTIME_SIMULATE=true pnpm e2e:mock` moves the
demo vessels for development.

## In e2e specs (`e2e/fixtures.ts`)

```ts
import { pushRealtime, resetMockGateway, waitForRealtimeRoom } from './fixtures';

test.beforeEach(() => resetMockGateway());

await page.goto('/map');
await waitForRealtimeRoom(/^tile:/); // the map's socket joined its viewport rooms
await pushRealtime({ kind: 'safety:states', items: [state] }); // or positions, alert, cii:updated, emit
```

`realtimeConnections()` lists the sockets and their rooms, `expectRealtimeConnected(page)`
waits for the top bar indicator. Events to rooms nobody joined are lost (as in production):
wait for the room, or push inside `expect.poll` until the UI shows it. For failures and delays
of a single request prefer Playwright's `page.route()` over mock state.
