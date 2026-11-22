#!/usr/bin/env node
// Minimal mock of the gateway for e2e tests and screenshots (no dependencies). The core below
// serves the auth endpoints of spec §13.1 with a rotating HttpOnly refresh cookie, GET /me and
// organizations; every feature adds its endpoints in routes/<feature>.mjs (loaded
// automatically, see routes/README.md). Every other /api/v2 route answers 404 problem details,
// like a service that is not deployed yet.
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';

import { claimsOf, matchPath, ORGS, problem, readBody, send, USERS } from './lib.mjs';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

// --- feature routes -------------------------------------------------------------------------

const ROUTES_DIR = new URL('./routes/', import.meta.url);

async function loadRoutes() {
  const files = readdirSync(ROUTES_DIR)
    .filter((file) => file.endsWith('.mjs'))
    .sort();
  const routes = [];
  const seen = new Map();
  for (const file of files) {
    const module = await import(new URL(file, ROUTES_DIR).href);
    if (!Array.isArray(module.routes))
      throw new Error(`routes/${file} must export "routes" (an array)`);
    for (const route of module.routes) {
      if (!route?.method || !route.path || typeof route.handler !== 'function') {
        throw new Error(`routes/${file}: every route needs method, path and handler`);
      }
      const key = `${route.method} ${String(route.path)}`;
      if (seen.has(key))
        throw new Error(`${key} is declared by routes/${seen.get(key)} and routes/${file}`);
      seen.set(key, file);
      routes.push({ ...route, file });
    }
  }
  return routes;
}

const featureRoutes = await loadRoutes();

// --- auth core (spec §13.1) -----------------------------------------------------------------

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
  user.memberships.map((m) => {
    const org = ORGS.find((o) => o.id === m.orgId);
    return { ...m, orgName: org?.name ?? m.orgId, orgKind: org?.kind };
  });

async function core(req, res, { method, path, claims, user }) {
  if (method === 'POST' && path === '/api/v2/auth/login') {
    const { email, password } = await readBody(req);
    const found = USERS.find((u) => u.email === String(email ?? '').toLowerCase());
    if (!found || found.password !== password)
      return problem(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    const orgId = found.memberships[0]?.orgId ?? null;
    const session = startSession(found, orgId);
    return send(
      res,
      200,
      {
        accessToken: session.token,
        expiresIn: 900,
        user: { id: found.id, email: found.email, name: found.name },
        memberships: memberships(found),
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
    const owner = USERS.find((u) => u.id === session.userId);
    const next = startSession(owner, session.orgId, session.sid);
    return send(
      res,
      200,
      { accessToken: next.token, expiresIn: 900 },
      { 'Set-Cookie': cookie(next.refresh) },
    );
  }

  if (method === 'POST' && path === '/api/v2/auth/logout') {
    const presented = readCookie(req);
    const session = presented ? sessions.get(presented) : undefined;
    // Logout revokes the whole family (spec §8.3).
    if (session)
      for (const [token, s] of sessions) if (s.sid === session.sid) sessions.delete(token);
    return send(res, 204, undefined, { 'Set-Cookie': cookie(null) });
  }

  if (method === 'POST' && path === '/api/v2/auth/password/forgot') return send(res, 202);

  if (!path.startsWith('/api/v2/')) return false;
  if (!claims) return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized');

  if (method === 'POST' && path === '/api/v2/auth/switch-org') {
    const { orgId } = await readBody(req);
    if (!user || !(user.platformAdmin || user.memberships.some((m) => m.orgId === orgId))) {
      return problem(res, 403, 'FORBIDDEN', 'Forbidden');
    }
    for (const session of sessions.values()) if (session.sid === claims.sid) session.orgId = orgId;
    return send(res, 200, {
      accessToken: accessToken(user, orgId, claims.sid),
      expiresIn: 900,
      activeOrgId: orgId,
    });
  }

  if (method === 'GET' && path === '/api/v2/me' && user) {
    return send(res, 200, {
      id: user.id,
      email: user.email,
      name: user.name,
      status: 'active',
      mfaEnabled: false,
      isPlatformAdmin: user.platformAdmin,
      memberships: memberships(user),
      activeOrgId: claims.org ?? null,
      roles: claims.roles ?? [],
    });
  }

  if (method === 'GET' && path === '/api/v2/organizations') {
    if (!claims.roles?.includes('super_admin')) return problem(res, 403, 'FORBIDDEN', 'Forbidden');
    return send(res, 200, { data: ORGS, meta: { page: 1, pageSize: 100, total: ORGS.length } });
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';
    if (path === '/health') return send(res, 200, { ok: true, routes: featureRoutes.length });

    const claims = claimsOf(req);
    const user = USERS.find((u) => u.id === claims?.sub);
    if ((await core(req, res, { method, path, claims, user })) !== false) return;

    for (const route of featureRoutes) {
      if (route.method !== method) continue;
      const params = matchPath(route.path, path);
      if (!params) continue;
      if (!route.public && !claims) return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return await route.handler({
        req,
        url,
        params,
        claims,
        body: () => readBody(req),
        send: (status, payload, headers) => send(res, status, payload, headers),
        problem: (status, code, title, extra) => problem(res, status, code, title, extra),
      });
    }

    return problem(res, 404, 'NOT_FOUND', 'Not found', { instance: path });
  } catch (error) {
    console.error('[mock] handler failed', error);
    if (!res.headersSent) problem(res, 500, 'INTERNAL_ERROR', 'Internal error');
  }
});

server.listen(PORT, () =>
  console.info(`mock gateway on http://localhost:${PORT} (${featureRoutes.length} feature routes)`),
);
