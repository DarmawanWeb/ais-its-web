// Helpers, types and demo data shared by the mock gateway (server.mjs, realtime.mjs) and its
// modules (base/*.mjs, routes/<feature>.mjs). Dependencies: node:* and the contracts package.
import { randomUUID } from 'node:crypto';

import {
  CursorQuerySchema,
  decodeCursor,
  encodeCursor,
  PageQuerySchema,
  toPaginated,
} from '@darmawanweb/ais-its-contracts/api';
import { parseRoles, rolesHavePermission } from '@darmawanweb/ais-its-contracts/auth';
import { z } from 'zod';

// --- module contract (routes/README.md) -----------------------------------------------------

/**
 * A mock module: `base/<service>.mjs` (foundation) or `routes/<feature>.mjs` (one per feature).
 * Every export is optional; `routes` must be an array when present.
 * @typedef {object} MockModule
 * @property {MockRoute[]} [routes] HTTP endpoints.
 * @property {MockRealtimeHooks} [realtime] Hooks on the mock socket.io server (/ws, spec §9).
 * @property {() => void} [reset] Restores the module's initial state (`POST /__mock/reset`).
 */

/**
 * An HTTP endpoint of a mock module.
 * @typedef {object} MockRoute
 * @property {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} method
 * @property {string | RegExp} path `/api/v2/zones/:id` (`:name` matches one segment, decoded into
 *   `params`), an exact path, or a RegExp whose named groups become `params`.
 * @property {boolean} [public] Answer without an access token (default: 401 without one).
 * @property {string | string[]} [permission] Required permission (a list = any of), checked with
 *   the contracts `ROLE_PERMISSIONS` (super_admin has every permission): 403 problem otherwise.
 * @property {(ctx: MockContext) => unknown} handler
 */

/**
 * @typedef {object} MockContext
 * @property {import('node:http').IncomingMessage} req
 * @property {URL} url `url.searchParams` holds the query.
 * @property {Record<string, string>} params Path parameters (`:name` segments, RegExp groups).
 * @property {Record<string, any> | null} claims Decoded access token (not verified).
 * @property {MockUser | null} user Demo account of the token (`USERS`).
 * @property {() => Promise<any>} body Parsed JSON body ({} when empty).
 * @property {(status: number, payload?: unknown, headers?: Record<string, string>) => void} send
 * @property {(status: number, code: string, title: string, extra?: Record<string, unknown>) => void} problem
 * @property {MockRealtime} realtime Pushes realtime events (e.g. `alert:updated` after an ack).
 */

/**
 * Hooks of a module on the mock realtime server. Each receives one object.
 * @typedef {object} MockRealtimeHooks
 * @property {(rt: MockRealtime) => void | (() => void)} [start] Once at start-up; may return a
 *   cleanup function. Publishing here only records the latest state (nobody is connected yet).
 * @property {(event: { socket: import('socket.io').Socket, claims: Record<string, any>, rt: MockRealtime }) => void} [connection]
 *   Every authenticated connection, after it joined `user:<id>`, `org:<id>`, `authority`.
 * @property {(event: { socket: import('socket.io').Socket, claims: Record<string, any>, bbox: number[], zoom: number, mode: 'tiles' | 'all', rooms: string[], rt: MockRealtime }) => void} [viewport]
 *   After an acknowledged `viewport:set` (the socket is in its tile rooms).
 * @property {(event: { socket: import('socket.io').Socket, claims: Record<string, any>, mmsi: number, rt: MockRealtime }) => void} [subscribe]
 *   After an acknowledged `vessel:subscribe` (the latest known position/state was sent).
 */

/**
 * The mock realtime server (realtime.mjs). Payloads are validated with the contracts schemas
 * (an invalid payload throws a 400 `MockHttpError`).
 * @typedef {object} MockRealtime
 * @property {import('socket.io').Server} io The socket.io server (escape hatch).
 * @property {(items: object[]) => void} positions `RealtimePosition[]` → `positions` batch per
 *   tile room and `tile:all`, `vessel:position` per vessel room; remembers the latest per vessel.
 * @property {(items: object[]) => void} safetyStates `RealtimeSafetyState[]` → `safety:states`
 *   and `vessel:safety`, same rooms.
 * @property {(alert: object, options?: { kind?: 'raised' | 'updated', orgIds?: string[] }) => void} alert
 *   `RealtimeAlert` → `alert:<kind>` to `authority` and `org:<id>` (default: the demo fleet owner).
 * @property {(update: object) => void} cii `CiiUpdatedV1` → `cii:updated` to `org:<update.orgId>`.
 * @property {(event: string, payload: unknown, options?: { rooms?: string[] }) => void} emit Any
 *   event, to rooms (default: every connection). No validation.
 * @property {(intervalMs: number, tick: () => void) => () => void} every Repeats `tick`; stopped on
 *   shutdown; returns the stop function.
 * @property {() => { id: string, userId: string | null, orgId: string | null, roles: string[], rooms: string[] }[]} connections
 */

/**
 * @typedef {object} MockUser
 * @property {string} id
 * @property {string} email
 * @property {string} password
 * @property {string} name
 * @property {{ orgId: string, role: string }[]} memberships
 * @property {boolean} platformAdmin
 */

// --- demo data ------------------------------------------------------------------------------

export const ORGS = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
    name: 'PT Pelayaran Nusantara',
    slug: 'pelayaran-nusantara',
    kind: 'shipping_company',
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-000000000002',
    name: 'KSOP Batam',
    slug: 'ksop-batam',
    kind: 'authority',
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-000000000003',
    name: 'AIS Maritime Intelligence',
    slug: 'ais-maritime-intelligence',
    kind: 'platform',
  },
];

/** Creation time of the demo records (organizations, accounts, memberships). */
export const DEMO_CREATED_AT = '2026-11-01T00:00:00.000Z';

/** `OrganizationDto` of a demo organization. */
export const organizationOf = (org) => ({
  ...org,
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
});

/** Organization that owns the demo vessels (default `org:<id>` room of realtime alerts). */
export const FLEET_ORG_ID = ORGS[0].id;

/** @type {MockUser[]} */
export const USERS = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a',
    email: 'admin@ais-its.local',
    password: 'ChangeMe123!',
    name: 'Dewi Admin',
    memberships: [
      { orgId: ORGS[2].id, role: 'org_admin' },
      { orgId: ORGS[0].id, role: 'org_admin' },
    ],
    platformAdmin: true,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6b',
    email: 'manager@pelni.test',
    password: 'Kapal12345',
    name: 'Rina Nakhoda',
    memberships: [{ orgId: ORGS[0].id, role: 'fleet_manager' }],
    platformAdmin: false,
  },
];

/**
 * Accounts of the role walkthrough (`e2e/roles.spec.ts`): one per remaining role of the spec §8.4
 * matrix. They can sign in and use every endpoint but are not part of the demo member and user
 * directory lists (`USERS`), which other specs count.
 * @type {MockUser[]}
 */
export const ROLE_USERS = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6c',
    email: 'orgadmin@pelni.test',
    password: 'Kapal12345',
    name: 'Bima Admin Armada',
    memberships: [{ orgId: ORGS[0].id, role: 'org_admin' }],
    platformAdmin: false,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6d',
    email: 'petugas@ksop-batam.test',
    password: 'Kapal12345',
    name: 'Sari Petugas KSOP',
    memberships: [{ orgId: ORGS[1].id, role: 'authority' }],
    platformAdmin: false,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6e',
    email: 'viewer@pelni.test',
    password: 'Kapal12345',
    name: 'Andi Pemantau',
    memberships: [{ orgId: ORGS[0].id, role: 'viewer' }],
    platformAdmin: false,
  },
];

/** Every account that can sign in to the mock gateway. */
export const ACCOUNTS = [...USERS, ...ROLE_USERS];

/** `MembershipDto[]` of a demo user (with organization name, slug and kind). */
export const membershipsOf = (user) =>
  user.memberships.map((m) => {
    const org = ORGS.find((o) => o.id === m.orgId);
    return {
      ...m,
      orgName: org?.name ?? m.orgId,
      orgSlug: org?.slug ?? m.orgId,
      orgKind: org?.kind,
      joinedAt: DEMO_CREATED_AT,
    };
  });

/** Live vessels around Batam / Singapore Strait: [mmsi, name, typeCode, lat, lon, hdg, sog]. */
export const VESSELS = [
  [525005223, 'KM Bahari Nusantara', 'tanker', 1.152, 103.902, 248, 9.8],
  [525019001, 'MV Batam Express', 'ro_ro_passenger_ship', 1.205, 103.83, 72, 18.2],
  [525019002, 'MT Selat Jaya', 'tanker', 1.118, 103.79, 300, 11.4],
  [525019003, 'KM Kepri Indah', 'general_cargo_ship', 1.095, 103.96, 120, 7.6],
  [563012345, 'Lion City Spirit', 'container_ship', 1.182, 103.74, 95, 14.1],
  [563045678, 'Pacific Reefer', 'refrigerated_cargo_carrier', 1.236, 103.99, 210, 12.3],
  [525019004, 'TB Pelita 5', 'unknown', 1.131, 103.87, 35, 4.2],
  [538007788, 'Ocean Bulk Star', 'bulk_carrier', 1.07, 103.71, 280, 10.9],
  [525019005, 'LNG Natuna', 'lng_carrier', 1.25, 103.86, 160, 13.5],
  [636019900, 'Car Carrier Aurora', 'ro_ro_cargo_ship_vc', 1.164, 104.05, 265, 15.7],
  [525019006, 'KM Rempang', 'ro_ro_passenger_ship', 1.02, 103.93, 15, 16.4],
  [525019007, 'MT Gas Riau', 'gas_carrier', 1.214, 103.93, 330, 8.8],
  [525019008, 'Cruise Harmony', 'cruise_passenger_ship', 1.27, 103.79, 85, 17.3],
  [525019009, 'MV Combi Tanjung', 'combination_carrier', 1.06, 103.82, 200, 9.1],
];

/** Stable per-MMSI vessel ids (fleet service UUIDs). */
export const vesselId = (mmsi) =>
  `0192f0c8-7d3a-7c2e-9a1b-${String(mmsi).padStart(12, '0').slice(-12)}`;

export const nowIso = () => new Date().toISOString();

// --- responses ------------------------------------------------------------------------------

export function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...(body === undefined
      ? {}
      : { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' }),
    'X-Request-Id': randomUUID(),
    ...headers,
  });
  res.end(payload);
}

export function problem(res, status, code, title, extra = {}, headers = {}) {
  send(
    res,
    status,
    {
      type: `urn:ais-its:problem:${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      traceId: randomUUID(),
      ...extra,
    },
    headers,
  );
}

/**
 * Thrown by a handler (or a helper such as `pageOf`) to answer RFC 9457 problem details:
 * `throw new MockHttpError(404, 'ZONE_NOT_FOUND', 'Zone not found')`.
 */
export class MockHttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} title
   * @param {Record<string, unknown>} [extra] e.g. `{ detail, errors: [{ field, message }] }`
   */
  constructor(status, code, title, extra = {}) {
    super(`${status} ${code}: ${title}`);
    this.status = status;
    this.code = code;
    this.title = title;
    this.extra = extra;
  }
}

function validationError(error) {
  return new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
    errors: error.issues.map((issue) => ({
      field: issue.path.join('.') || '(query)',
      message: issue.message,
    })),
  });
}

export async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try {
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// --- identity -------------------------------------------------------------------------------

/** Claims of an access token (the mock never verifies signatures). */
export function decodeToken(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/** Decodes the bearer token's claims (the mock never verifies signatures). */
export function claimsOf(req) {
  return decodeToken((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
}

/** `true` when the token's roles grant `permission` (a list = any of; super_admin: all). */
export function can(claims, permission) {
  const roles = parseRoles(claims?.roles ?? []);
  if (roles.includes('super_admin')) return true;
  const wanted = Array.isArray(permission) ? permission : [permission];
  return wanted.some((p) => rolesHavePermission(roles, p));
}

// --- lists (spec §5) ------------------------------------------------------------------------

/**
 * One page of `items` for the query `page` / `pageSize` (default 20, ≤ 100):
 * `{ data, meta: { page, pageSize, total } }`. Invalid queries throw 400 VALIDATION_FAILED.
 * @template T
 * @param {T[]} items
 * @param {URL} url
 */
export function pageOf(items, url) {
  const query = PageQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) throw validationError(query.error);
  const { page, pageSize } = query.data;
  const start = (page - 1) * pageSize;
  return toPaginated(items.slice(start, start + pageSize), query.data, items.length);
}

/**
 * A cursor page of `items` (already in the endpoint's order) for the query `cursor` / `limit`
 * (default 100, ≤ 500): `{ data, page: { nextCursor, limit } }`. The cursor is an opaque offset.
 * @template T
 * @param {T[]} items
 * @param {URL} url
 */
export function cursorPageOf(items, url) {
  const query = CursorQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) throw validationError(query.error);
  const { cursor, limit } = query.data;
  const offset = cursor
    ? decodeCursor(cursor, z.object({ offset: z.int().min(0) }))
    : { offset: 0 };
  if (!offset) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
      errors: [{ field: 'cursor', message: 'Invalid cursor' }],
    });
  }
  const end = offset.offset + limit;
  return {
    data: items.slice(offset.offset, end),
    page: { nextCursor: end < items.length ? encodeCursor({ offset: end }) : null, limit },
  };
}

// --- route paths ----------------------------------------------------------------------------

/**
 * Compiles a route path. Patterns are split into segments: `:name` matches one non-empty
 * segment (URI-decoded into `params.name`), any other segment matches itself. `rank` orders
 * routes: at the first differing segment a literal beats a parameter, so `/zones/geojson` wins
 * over `/zones/:id` whatever the file order. RegExps rank after every pattern.
 * @param {string | RegExp} path
 * @returns {{ key: string, rank: string, regexp: boolean, match: (pathname: string) => Record<string, string> | null }}
 */
export function compilePath(path) {
  if (path instanceof RegExp) {
    return {
      key: String(path),
      rank: '',
      regexp: true,
      match: (pathname) => {
        const match = path.exec(pathname);
        return match ? { ...(match.groups ?? {}) } : null;
      },
    };
  }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(
      `invalid path ${JSON.stringify(path)} (a string starting with "/" or a RegExp)`,
    );
  }
  const segments = splitPath(path);
  for (const segment of segments) {
    if (segment === ':' || (segment.startsWith(':') && !/^:[A-Za-z_]\w*$/.test(segment))) {
      throw new Error(`invalid parameter "${segment}" in ${path} (use :name)`);
    }
  }
  return {
    key: `/${segments.map((s) => (s.startsWith(':') ? ':' : s)).join('/')}`,
    rank: segments.map((s) => (s.startsWith(':') ? 'P' : 'S')).join(''),
    regexp: false,
    match: (pathname) => {
      const parts = splitPath(pathname);
      if (parts.length !== segments.length) return null;
      const params = {};
      for (const [index, segment] of segments.entries()) {
        const part = parts[index];
        if (segment.startsWith(':')) {
          try {
            params[segment.slice(1)] = decodeURIComponent(part);
          } catch {
            return null;
          }
        } else if (segment !== part) return null;
      }
      return params;
    },
  };
}

function splitPath(path) {
  return path.split('/').filter((segment) => segment !== '');
}

/** Params of a route path match, or null (kept for modules written before `compilePath`). */
export function matchPath(pattern, path) {
  return compilePath(pattern).match(path);
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const REALTIME_HOOKS = new Set(['start', 'connection', 'viewport', 'subscribe']);

/**
 * Checks the exports of a mock module (`routes`, `realtime`, `reset`); throws with `source`
 * in the message.
 * @param {Record<string, unknown>} module
 * @param {string} source e.g. `routes/zones.mjs`
 * @returns {{ source: string, routes: MockRoute[], realtime: MockRealtimeHooks, reset?: () => void }}
 */
export function validateModule(module, source) {
  const { routes, realtime, reset } = module;
  if (routes === undefined && realtime === undefined && reset === undefined) {
    throw new Error(`${source} exports none of "routes", "realtime", "reset"`);
  }
  if (routes !== undefined && !Array.isArray(routes)) {
    throw new Error(`${source}: "routes" must be an array`);
  }
  if (realtime !== undefined) {
    if (typeof realtime !== 'object' || realtime === null) {
      throw new Error(`${source}: "realtime" must be an object of hooks`);
    }
    for (const [name, hook] of Object.entries(realtime)) {
      if (!REALTIME_HOOKS.has(name)) {
        throw new Error(
          `${source}: unknown realtime hook "${name}" (${[...REALTIME_HOOKS].join(', ')})`,
        );
      }
      if (typeof hook !== 'function')
        throw new Error(`${source}: realtime.${name} must be a function`);
    }
  }
  if (reset !== undefined && typeof reset !== 'function') {
    throw new Error(`${source}: "reset" must be a function`);
  }
  return { source, routes: routes ?? [], realtime: realtime ?? {}, reset };
}

/**
 * Builds the route table of the mock gateway from its layers, in precedence order:
 * `core` (session endpoints, reserved), `feature` (routes/<feature>.mjs) and `base`
 * (base/*.mjs, foundation defaults). The same method + path twice in one layer, or a feature
 * route on a core endpoint, is an error; a feature route replaces the base route it repeats.
 * @param {{ layer: 'core' | 'feature' | 'base', source: string, routes: MockRoute[] }[]} modules
 * @returns {{ routes: (MockRoute & { source: string, layer: string, match: (p: string) => Record<string, string> | null })[], overrides: { key: string, source: string, replaced: string }[] }}
 */
export function buildRouteTable(modules) {
  const byLayer = { core: new Map(), feature: new Map(), base: new Map() };
  for (const { layer, source, routes } of modules) {
    if (!byLayer[layer]) throw new Error(`${source}: unknown layer ${layer}`);
    if (!Array.isArray(routes)) throw new Error(`${source} must export "routes" (an array)`);
    for (const route of routes) {
      if (!route || !METHODS.has(route.method) || typeof route.handler !== 'function') {
        throw new Error(
          `${source}: every route needs method (${[...METHODS].join('|')}), path and handler`,
        );
      }
      let compiled;
      try {
        compiled = compilePath(route.path);
      } catch (error) {
        throw new Error(`${source}: ${error.message}`);
      }
      const key = `${route.method} ${compiled.key}`;
      const seen = byLayer[layer].get(key);
      if (seen) throw new Error(`${key} is declared by ${seen.source} and ${source}`);
      byLayer[layer].set(key, { ...route, ...compiled, key, source, layer });
    }
  }
  const overrides = [];
  for (const [key, route] of byLayer.feature) {
    const core = byLayer.core.get(key);
    if (core) throw new Error(`${route.source}: ${key} is reserved by the mock core (session)`);
    const base = byLayer.base.get(key);
    if (base) {
      byLayer.base.delete(key);
      overrides.push({ key, source: route.source, replaced: base.source });
    }
  }
  const order = { core: 0, feature: 1, base: 2 };
  const routes = [...byLayer.core.values(), ...byLayer.feature.values(), ...byLayer.base.values()]
    .map((route, index) => ({ route, index }))
    .sort((a, b) => {
      if (a.route.regexp !== b.route.regexp) return a.route.regexp ? 1 : -1;
      // Literal segments ('S') before parameters ('P') at the first difference.
      if (!a.route.regexp && a.route.rank !== b.route.rank) {
        return a.route.rank > b.route.rank ? -1 : 1;
      }
      return order[a.route.layer] - order[b.route.layer] || a.index - b.index;
    })
    .map(({ route }) => route);
  return { routes, overrides };
}
