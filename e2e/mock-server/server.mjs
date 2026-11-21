#!/usr/bin/env node
// Minimal mock of the gateway for e2e tests and screenshots (no dependencies): the auth
// endpoints of spec §13.1 with a rotating HttpOnly refresh cookie, GET /me, organizations,
// a few live vessels around Batam (AIS + safety states) and vessel search. Every other
// /api/v2 route answers 404 problem details, like a service that is not deployed yet.
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

const ORGS = [
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

const USERS = [
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

const sessions = new Map(); // refresh token -> { userId, orgId, sid }

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function accessToken(user, orgId, sid) {
  const now = Math.floor(Date.now() / 1000);
  const membership = user.memberships.find((m) => m.orgId === orgId);
  const roles = [
    ...(membership ? [membership.role] : []),
    ...(user.platformAdmin ? ['super_admin'] : []),
  ];
  const claims = {
    iss: 'ais-its-auth',
    aud: 'ais-its-api',
    sub: user.id,
    sid,
    org: orgId,
    roles,
    email: user.email,
    name: user.name,
    typ: 'access',
    iat: now,
    exp: now + 900,
  };
  return `${b64({ alg: 'EdDSA', typ: 'JWT', kid: 'mock' })}.${b64(claims)}.bW9jaw`;
}

function claimsOf(req) {
  const header = req.headers.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    'X-Request-Id': randomUUID(),
    ...headers,
  });
  res.end(payload);
}

function problem(res, status, code, title, extra = {}, headers = {}) {
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

function cookie(token) {
  return token
    ? `aisits_rt=${token}; HttpOnly; Path=/api/v2/auth; SameSite=Strict; Max-Age=2592000`
    : 'aisits_rt=; HttpOnly; Path=/api/v2/auth; SameSite=Strict; Max-Age=0';
}

function readCookie(req) {
  return /(?:^|;\s*)aisits_rt=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;
}

function startSession(user, orgId, sid = randomUUID()) {
  const refresh = randomBytes(32).toString('base64url');
  sessions.set(refresh, { userId: user.id, orgId, sid });
  return { refresh, token: accessToken(user, orgId, sid), sid };
}

const memberships = (user) =>
  user.memberships.map((m) => ({
    ...m,
    orgName: ORGS.find((o) => o.id === m.orgId)?.name ?? m.orgId,
  }));

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try {
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// Live vessels around Batam / Singapore Strait.
const NOW = () => new Date().toISOString();
const VESSELS = [
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

function latest() {
  return VESSELS.map(([mmsi, name, typeCode, lat, lon, hdg, sog], index) => ({
    mmsi,
    time: NOW(),
    lat,
    lon,
    sog,
    cog: hdg,
    hdg,
    navstatus: sog < 1 ? 1 : 0,
    predictedNavstatus: 0,
    source: index % 3 === 0 ? 'batam' : 'primary',
    vessel: { id: randomUUID(), name, typeCode },
  }));
}

function safetyStates() {
  return [
    {
      mmsi: 525005223,
      time: NOW(),
      lat: 1.152,
      lon: 103.902,
      ewsStatus: 0,
      collisionRisk: 'none',
      closestEncounter: null,
    },
    {
      mmsi: 525019004,
      time: NOW(),
      lat: 1.131,
      lon: 103.87,
      ewsStatus: 1,
      collisionRisk: 'none',
      closestEncounter: null,
    },
    {
      mmsi: 525019002,
      time: NOW(),
      lat: 1.118,
      lon: 103.79,
      ewsStatus: 3,
      collisionRisk: 'high',
      closestEncounter: { otherMmsi: 563012345, cpaNm: 0.35, tcpaMin: 6.5 },
    },
    {
      mmsi: 563012345,
      time: NOW(),
      lat: 1.182,
      lon: 103.74,
      ewsStatus: 3,
      collisionRisk: 'medium',
      closestEncounter: { otherMmsi: 525019002, cpaNm: 0.35, tcpaMin: 6.5 },
    },
  ];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/health') return send(res, 200, { ok: true });

  if (method === 'POST' && path === '/api/v2/auth/login') {
    const { email, password } = await body(req);
    const user = USERS.find((u) => u.email === String(email ?? '').toLowerCase());
    if (!user || user.password !== password)
      return problem(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const orgId = user.memberships[0]?.orgId ?? null;
    const session = startSession(user, orgId);
    return send(
      res,
      200,
      {
        accessToken: session.token,
        expiresIn: 900,
        user: { id: user.id, email: user.email, name: user.name },
        memberships: memberships(user),
        activeOrgId: orgId,
      },
      { 'Set-Cookie': cookie(session.refresh) },
    );
  }

  if (method === 'POST' && path === '/api/v2/auth/refresh') {
    const presented = readCookie(req);
    const session = presented ? sessions.get(presented) : undefined;
    if (!session)
      return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized', {}, { 'Set-Cookie': cookie(null) });
    sessions.delete(presented);
    const user = USERS.find((u) => u.id === session.userId);
    const next = startSession(user, session.orgId, session.sid);
    return send(
      res,
      200,
      { accessToken: next.token, expiresIn: 900 },
      { 'Set-Cookie': cookie(next.refresh) },
    );
  }

  if (method === 'POST' && path === '/api/v2/auth/logout') {
    const presented = readCookie(req);
    if (presented) sessions.delete(presented);
    res.writeHead(204, { 'Set-Cookie': cookie(null) });
    return res.end();
  }

  if (method === 'POST' && path === '/api/v2/auth/password/forgot') {
    res.writeHead(202);
    return res.end();
  }

  const claims = claimsOf(req);
  if (path.startsWith('/api/v2/') && !claims)
    return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  const user = USERS.find((u) => u.id === claims?.sub);

  if (method === 'POST' && path === '/api/v2/auth/switch-org') {
    const { orgId } = await body(req);
    if (!user || !(user.platformAdmin || user.memberships.some((m) => m.orgId === orgId))) {
      return problem(res, 403, 'FORBIDDEN', 'Forbidden');
    }
    for (const session of sessions.values()) if (session.sid === claims.sid) session.orgId = orgId;
    return send(res, 200, { accessToken: accessToken(user, orgId, claims.sid), expiresIn: 900 });
  }

  if (method === 'GET' && path === '/api/v2/me' && user) {
    return send(res, 200, {
      id: user.id,
      email: user.email,
      name: user.name,
      mfaEnabled: false,
      memberships: memberships(user),
    });
  }

  if (method === 'GET' && path === '/api/v2/organizations') {
    if (!claims.roles?.includes('super_admin')) return problem(res, 403, 'FORBIDDEN', 'Forbidden');
    return send(res, 200, { data: ORGS, meta: { page: 1, pageSize: 100, total: ORGS.length } });
  }

  if (method === 'GET' && path === '/api/v2/ais/latest') return send(res, 200, latest());
  if (method === 'GET' && path === '/api/v2/safety/vessels') return send(res, 200, safetyStates());

  if (method === 'GET' && path === '/api/v2/vessels') {
    const term = (url.searchParams.get('search') ?? '').toLowerCase();
    const data = latest()
      .filter(
        (v) => !term || v.vessel.name.toLowerCase().includes(term) || String(v.mmsi).includes(term),
      )
      .slice(0, Number(url.searchParams.get('pageSize') ?? 20))
      .map((v) => ({ id: v.vessel.id, mmsi: v.mmsi, imo: null, name: v.vessel.name, flag: 'ID' }));
    return send(res, 200, { data, meta: { page: 1, pageSize: 20, total: data.length } });
  }

  if (path.startsWith('/api/') || path.startsWith('/ws') || path.startsWith('/tiles')) {
    return problem(res, 404, 'NOT_FOUND', 'Not found', { instance: path });
  }
  return problem(res, 404, 'NOT_FOUND', 'Not found');
});

server.listen(PORT, () => console.info(`mock gateway on http://localhost:${PORT}`));
