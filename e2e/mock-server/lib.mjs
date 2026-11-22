// Helpers and demo data shared by the mock gateway (server.mjs) and its feature route files
// (routes/*.mjs). No dependencies: node:* only.
import { randomUUID } from 'node:crypto';

/**
 * A route contributed by a feature file in routes/ (loaded automatically, in file name order).
 * @typedef {object} MockRoute
 * @property {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} method
 * @property {string | RegExp} path Exact path, or a RegExp whose named groups become `params`.
 * @property {boolean} [public] Answer without an access token (default: 401 without one).
 * @property {(ctx: MockContext) => unknown} handler
 */

/**
 * @typedef {object} MockContext
 * @property {import('node:http').IncomingMessage} req
 * @property {URL} url
 * @property {Record<string, string>} params Named groups of a RegExp path.
 * @property {Record<string, any> | null} claims Decoded access token (not verified).
 * @property {() => Promise<any>} body Parsed JSON body ({} when empty).
 * @property {(status: number, payload?: unknown, headers?: Record<string, string>) => void} send
 * @property {(status: number, code: string, title: string, extra?: Record<string, unknown>) => void} problem
 */

export const ORGS = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
    name: 'PT Pelayaran Nusantara',
    kind: 'shipping_company',
  },
  { id: '0192f0c8-7d3a-7c2e-9a1b-000000000002', name: 'KSOP Batam', kind: 'authority' },
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-000000000003',
    name: 'AIS Maritime Intelligence',
    kind: 'platform',
  },
];

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

export async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try {
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/** Decodes the bearer token's claims (the mock never verifies signatures). */
export function claimsOf(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Params of a route path match, or null. */
export function matchPath(pattern, path) {
  if (typeof pattern === 'string') return pattern === path ? {} : null;
  const match = pattern.exec(path);
  return match ? { ...(match.groups ?? {}) } : null;
}
