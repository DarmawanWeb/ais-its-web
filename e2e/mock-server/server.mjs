#!/usr/bin/env node
// Mock of the gateway for e2e tests, screenshots and backend-less development (`pnpm e2e:mock`):
//   core          the auth session endpoints of spec §13.1 (rotating HttpOnly refresh cookie)
//   base/*.mjs    foundation defaults several features read (GET /me, organizations, vessel
//                 search, live positions, safety states, alert summary)
//   routes/*.mjs  one module per feature, routes/<feature>.mjs, loaded automatically; a feature
//                 route replaces the base route with the same method and path (routes/README.md)
//   /ws           socket.io realtime server of spec §9 (realtime.mjs), fed by the modules'
//                 realtime hooks, their HTTP handlers and the test controls
//   /__mock/*     test controls (not proxied to the app): push realtime events, list realtime
//                 connections, reset module state (e2e/fixtures.ts)
// Every other /api/v2 route answers 404 problem details, like a service that is not deployed yet.
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  buildRouteTable,
  can,
  claimsOf,
  decodeToken,
  membershipsOf,
  MockHttpError,
  problem,
  readBody,
  send,
  ACCOUNTS,
  validateModule,
} from './lib.mjs';
import { createRealtime } from './realtime.mjs';

const BASE_DIR = new URL('./base/', import.meta.url);
const ROUTES_DIR = new URL('./routes/', import.meta.url);
const FEATURES_DIR = new URL('../../src/features/', import.meta.url);

/**
 * Imports the modules of a directory in file name order; files starting with "_" (templates)
 * are skipped. Feature modules must be named after an existing feature (src/features/<id>/).
 */
async function loadModules(dir, prefix, { features = false } = {}) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.mjs') && !file.startsWith('_'))
    .sort();
  const modules = [];
  for (const file of files) {
    const source = `${prefix}/${file}`;
    const id = file.slice(0, -'.mjs'.length);
    if (features && !existsSync(new URL(`${id}/routes.tsx`, FEATURES_DIR))) {
      throw new Error(
        `${source}: there is no feature "${id}" (src/features/${id}/routes.tsx); name the module after its feature id`,
      );
    }
    modules.push(validateModule(await import(new URL(file, dir).href), source));
  }
  return modules;
}

/** Realtime handshake: an unexpired access token (the mock never verifies signatures). */
function authenticate(token) {
  if (typeof token !== 'string' || token === '') return null;
  const claims = decodeToken(token);
  if (!claims || claims.typ !== 'access' || typeof claims.sub !== 'string') return null;
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

// --- auth core (spec §13.1) -----------------------------------------------------------------

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

/** Session endpoints (reserved: feature modules cannot override them). */
function coreRoutes() {
  const sessions = new Map(); // refresh token -> { userId, orgId, sid }

  function startSession(user, orgId, sid = randomUUID()) {
    const refresh = randomBytes(32).toString('base64url');
    sessions.set(refresh, { userId: user.id, orgId, sid });
    return { refresh, token: accessToken(user, orgId, sid), sid };
  }

  /** @type {import('./lib.mjs').MockRoute[]} */
  return [
    {
      method: 'POST',
      path: '/api/v2/auth/login',
      public: true,
      handler: async ({ body, send, problem }) => {
        const { email, password } = await body();
        const found = ACCOUNTS.find((u) => u.email === String(email ?? '').toLowerCase());
        if (!found || found.password !== password)
          return problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
        const orgId = found.memberships[0]?.orgId ?? null;
        const session = startSession(found, orgId);
        return send(
          200,
          {
            accessToken: session.token,
            expiresIn: 900,
            user: { id: found.id, email: found.email, name: found.name },
            memberships: membershipsOf(found),
            activeOrgId: orgId,
          },
          { 'Set-Cookie': cookie(session.refresh) },
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v2/auth/refresh',
      public: true,
      handler: ({ req, send, problem }) => {
        const presented = readCookie(req);
        const session = presented ? sessions.get(presented) : undefined;
        if (!session)
          return problem(401, 'UNAUTHORIZED', 'Unauthorized', {}, { 'Set-Cookie': cookie(null) });
        sessions.delete(presented);
        const owner = ACCOUNTS.find((u) => u.id === session.userId);
        const next = startSession(owner, session.orgId, session.sid);
        return send(
          200,
          { accessToken: next.token, expiresIn: 900 },
          { 'Set-Cookie': cookie(next.refresh) },
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v2/auth/logout',
      public: true,
      handler: ({ req, send }) => {
        const presented = readCookie(req);
        const session = presented ? sessions.get(presented) : undefined;
        // Logout revokes the whole family (spec §8.3).
        if (session)
          for (const [token, s] of sessions) if (s.sid === session.sid) sessions.delete(token);
        return send(204, undefined, { 'Set-Cookie': cookie(null) });
      },
    },
    {
      method: 'POST',
      path: '/api/v2/auth/password/forgot',
      public: true,
      handler: ({ send }) => send(202),
    },
    {
      method: 'POST',
      path: '/api/v2/auth/switch-org',
      handler: async ({ claims, user, body, send, problem }) => {
        const { orgId } = await body();
        if (!user || !(user.platformAdmin || user.memberships.some((m) => m.orgId === orgId))) {
          return problem(403, 'FORBIDDEN', 'Forbidden');
        }
        for (const session of sessions.values())
          if (session.sid === claims.sid) session.orgId = orgId;
        return send(200, {
          accessToken: accessToken(user, orgId, claims.sid),
          expiresIn: 900,
          activeOrgId: orgId,
        });
      },
    },
  ];
}

// --- gateway --------------------------------------------------------------------------------

/**
 * Starts the mock gateway. `port: 0` picks a free port (tests).
 * @param {{ port?: number, log?: boolean }} [options]
 */
export async function startMockGateway({
  port = Number(process.env.MOCK_PORT ?? 8787),
  log = true,
} = {}) {
  const base = await loadModules(BASE_DIR, 'base');
  const features = await loadModules(ROUTES_DIR, 'routes', { features: true });
  const modules = [...base, ...features];
  const { routes, overrides } = buildRouteTable([
    { layer: 'core', source: 'server.mjs', routes: coreRoutes() },
    ...features.map((module) => ({ layer: 'feature', ...module })),
    ...base.map((module) => ({ layer: 'base', ...module })),
  ]);

  const server = createServer((req, res) => void handle(req, res));
  const realtime = createRealtime(server, { authenticate });
  const rt = realtime.api;

  async function control(req, res, method, path) {
    if (method === 'GET' && path === '/__mock/realtime') {
      return send(res, 200, { connections: rt.connections() });
    }
    if (method === 'POST' && path === '/__mock/realtime') {
      const message = await readBody(req);
      if (message.kind === 'positions') rt.positions(message.items);
      else if (message.kind === 'safety:states') rt.safetyStates(message.items);
      else if (message.kind === 'alert')
        rt.alert(message.alert, { kind: message.event, orgIds: message.orgIds });
      else if (message.kind === 'cii:updated') rt.cii(message.update);
      else if (message.kind === 'emit')
        rt.emit(message.event, message.payload, { rooms: message.rooms });
      else {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Unknown realtime message', {
          detail: 'kind: positions | safety:states | alert | cii:updated | emit',
        });
      }
      return send(res, 200, { ok: true, connections: rt.connections().length });
    }
    if (method === 'POST' && path === '/__mock/reset') {
      for (const module of modules) module.reset?.();
      return send(res, 204);
    }
    return problem(res, 404, 'NOT_FOUND', 'Not found', { instance: path });
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;
      const method = req.method ?? 'GET';
      if (path === '/health') {
        return send(res, 200, {
          ok: true,
          routes: routes.length,
          modules: modules.map((module) => module.source),
          realtime: { connections: rt.connections().length },
        });
      }
      if (path.startsWith('/__mock/')) return await control(req, res, method, path);

      const claims = claimsOf(req);
      const user = ACCOUNTS.find((u) => u.id === claims?.sub) ?? null;
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = route.match(path);
        if (!params) continue;
        if (!route.public && !claims) return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized');
        if (route.permission && !can(claims, route.permission))
          return problem(res, 403, 'FORBIDDEN', 'Forbidden');
        let body;
        await route.handler({
          req,
          url,
          params,
          claims,
          user,
          body: () => (body ??= readBody(req)),
          send: (status, payload, headers) => send(res, status, payload, headers),
          problem: (status, code, title, extra, headers) =>
            problem(res, status, code, title, extra, headers),
          realtime: rt,
        });
        if (!res.headersSent) {
          console.error(`[mock] ${route.source}: ${route.key} did not answer`);
          problem(res, 500, 'INTERNAL_ERROR', `${route.source} did not answer ${route.key}`);
        }
        return;
      }

      if (path.startsWith('/api/v2/') && !claims)
        return problem(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return problem(res, 404, 'NOT_FOUND', 'Not found', { instance: path });
    } catch (error) {
      if (error instanceof MockHttpError) {
        if (!res.headersSent) problem(res, error.status, error.code, error.title, error.extra);
        return;
      }
      console.error('[mock] handler failed', error);
      if (!res.headersSent) problem(res, 500, 'INTERNAL_ERROR', 'Internal error');
    }
  }

  for (const module of modules) realtime.use(module.source, module.realtime);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(undefined));
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  if (log) {
    for (const { key, source, replaced } of overrides)
      console.info(`[mock] ${source} overrides ${key} of ${replaced}`);
    console.info(
      `mock gateway on http://localhost:${actualPort} (${routes.length} routes, realtime on /ws; ${modules.map((m) => m.source).join(', ')})`,
    );
  }
  return {
    url: `http://localhost:${actualPort}`,
    port: actualPort,
    routes,
    overrides,
    realtime: rt,
    /** Stops the realtime server, the module hooks and the HTTP server. */
    close: () => realtime.close(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gateway = await startMockGateway();
  const stop = () => {
    setTimeout(() => process.exit(0), 2_000).unref();
    void gateway.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
