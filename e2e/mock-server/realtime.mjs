// Mock of the notification service's realtime gateway (spec §9): socket.io at /ws with the
// handshake, rooms and acknowledgements of the real one (services/notification README,
// "Realtime protocol"), validated with the contracts schemas. It emits nothing by itself:
// modules publish through the MockRealtime API (realtime hooks, HTTP handlers) and tests through
// POST /__mock/realtime (e2e/fixtures.ts `pushRealtime`).
import { CiiUpdatedV1Schema } from '@darmawanweb/ais-its-contracts/events';
import {
  ALL_TILES_ROOM,
  AUTHORITY_ROOM,
  orgRoom,
  parseTileRoom,
  REALTIME_PATH,
  RealtimeAlertSchema,
  RealtimePositionSchema,
  RealtimeSafetyStateSchema,
  roomsForViewport,
  tileRoomForPosition,
  userRoom,
  vesselRoom,
  VesselSubscribeRequestSchema,
  ViewportSetRequestSchema,
} from '@darmawanweb/ais-its-contracts/realtime';
import { Server } from 'socket.io';
import { z } from 'zod';

import { FLEET_ORG_ID, MockHttpError, nowIso } from './lib.mjs';

/** `vessel:<mmsi>` rooms per connection (REALTIME_MAX_VESSEL_SUBSCRIPTIONS of the service). */
const MAX_VESSEL_SUBSCRIPTIONS = 100;

const PositionsSchema = z.array(RealtimePositionSchema);
const SafetyStatesSchema = z.array(RealtimeSafetyStateSchema);

const describeIssues = (error) =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '(payload)'}: ${issue.message}`)
    .join('; ');

const invalid = (message) => ({ ok: false, error: { code: 'VALIDATION_FAILED', message } });

function parse(schema, value, what) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new MockHttpError(400, 'VALIDATION_FAILED', `Invalid ${what}`, {
      detail: describeIssues(result.error),
    });
  }
  return result.data;
}

const isViewportRoom = (room) => room === ALL_TILES_ROOM || parseTileRoom(room) !== null;

/** The latest item per MMSI (by `time`): a batch carries one entry per vessel (spec §9). */
function latestPerVessel(items) {
  const latest = new Map();
  for (const item of items) {
    const known = latest.get(item.mmsi);
    if (!known || item.time >= known.time) latest.set(item.mmsi, item);
  }
  return [...latest.values()];
}

/**
 * Attaches the mock realtime server to the gateway's HTTP server.
 * @param {import('node:http').Server} httpServer
 * @param {{ authenticate: (token: unknown) => Record<string, any> | null }} options
 */
export function createRealtime(httpServer, { authenticate }) {
  const io = new Server(httpServer, { path: REALTIME_PATH, serveClient: false });
  /** @type {Map<number, object>} */
  const latestPositions = new Map();
  /** @type {Map<number, object>} */
  const latestSafety = new Map();
  const timers = new Set();
  const cleanups = [];
  /** @type {Record<string, { source: string, hook: Function }[]>} */
  const listeners = { connection: [], viewport: [], subscribe: [] };

  /** @type {import('./lib.mjs').MockRealtime} */
  const api = {
    io,
    positions(items) {
      publish(
        'positions',
        'vessel:position',
        parse(PositionsSchema, items, 'positions'),
        latestPositions,
      );
    },
    safetyStates(items) {
      publish(
        'safety:states',
        'vessel:safety',
        parse(SafetyStatesSchema, items, 'safety states'),
        latestSafety,
      );
    },
    alert(alert, { kind = 'raised', orgIds = [FLEET_ORG_ID] } = {}) {
      if (kind !== 'raised' && kind !== 'updated') {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Alert kind must be raised or updated');
      }
      const payload = parse(RealtimeAlertSchema, alert, 'alert');
      io.to([AUTHORITY_ROOM, ...orgIds.map(orgRoom)]).emit(`alert:${kind}`, payload);
    },
    cii(update) {
      const payload = parse(CiiUpdatedV1Schema, update, 'cii:updated');
      if (payload.orgId) io.to(orgRoom(payload.orgId)).emit('cii:updated', payload);
    },
    emit(event, payload, { rooms } = {}) {
      if (typeof event !== 'string' || event === '') {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'An event name is required');
      }
      (rooms?.length ? io.to(rooms) : io).emit(event, payload);
    },
    every(intervalMs, tick) {
      const timer = setInterval(() => {
        try {
          tick();
        } catch (error) {
          console.error('[mock] realtime timer failed', error);
        }
      }, intervalMs);
      timer.unref();
      timers.add(timer);
      return () => {
        clearInterval(timer);
        timers.delete(timer);
      };
    },
    connections() {
      return [...io.of('/').sockets.values()].map((socket) => ({
        id: socket.id,
        userId: socket.data.claims?.sub ?? null,
        orgId: socket.data.claims?.org ?? null,
        roles: socket.data.claims?.roles ?? [],
        rooms: [...socket.rooms].filter((room) => room !== socket.id).sort(),
      }));
    },
  };

  /** Batches per tile room and `tile:all`, single events per vessel room (spec §9). */
  function publish(event, vesselEvent, items, latest) {
    const batch = latestPerVessel(items);
    if (batch.length === 0) return;
    const at = nowIso();
    const byTile = new Map();
    for (const item of batch) {
      const room = tileRoomForPosition(item.lon, item.lat);
      byTile.set(room, [...(byTile.get(room) ?? []), item]);
      const known = latest.get(item.mmsi);
      if (!known || item.time >= known.time) latest.set(item.mmsi, item);
      io.to(vesselRoom(item.mmsi)).emit(vesselEvent, item);
    }
    for (const [room, group] of byTile) io.to(room).emit(event, { at, items: group });
    io.to(ALL_TILES_ROOM).emit(event, { at, items: batch });
  }

  function run(name, event) {
    for (const { source, hook } of listeners[name]) {
      try {
        hook({ ...event, rt: api });
      } catch (error) {
        console.error(`[mock] realtime.${name} of ${source} failed`, error);
      }
    }
  }

  io.use((socket, next) => {
    const claims = authenticate(socket.handshake.auth?.token);
    if (claims) {
      socket.data.claims = claims;
      socket.data.vessels = new Set();
      next();
      return;
    }
    const error = new Error('Invalid or expired access token');
    error.data = { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' };
    next(error);
  });

  io.on('connection', (socket) => {
    const { claims } = socket.data;
    socket.join(userRoom(claims.sub));
    if (claims.org) socket.join(orgRoom(claims.org));
    if ((claims.roles ?? []).some((role) => role === 'authority' || role === 'super_admin')) {
      socket.join(AUTHORITY_ROOM);
    }

    socket.on('viewport:set', (request, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const parsed = ViewportSetRequestSchema.safeParse(request);
      if (!parsed.success) return reply(invalid(describeIssues(parsed.error)));
      let viewport;
      try {
        viewport = roomsForViewport(parsed.data.bbox);
      } catch (error) {
        return reply(invalid(error instanceof Error ? error.message : String(error)));
      }
      const rooms = [...new Set(viewport.rooms)];
      for (const room of [...socket.rooms]) {
        if (isViewportRoom(room) && !rooms.includes(room)) socket.leave(room);
      }
      socket.join(rooms);
      reply({
        ok: true,
        data: { mode: viewport.mode, tileCount: viewport.mode === 'tiles' ? rooms.length : 0 },
      });
      run('viewport', { socket, claims, ...parsed.data, mode: viewport.mode, rooms });
    });

    socket.on('vessel:subscribe', (request, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const parsed = VesselSubscribeRequestSchema.safeParse(request);
      if (!parsed.success) return reply(invalid(describeIssues(parsed.error)));
      const { mmsi } = parsed.data;
      let room;
      try {
        room = vesselRoom(mmsi);
      } catch (error) {
        return reply(invalid(error instanceof Error ? error.message : String(error)));
      }
      if (!socket.data.vessels.has(mmsi) && socket.data.vessels.size >= MAX_VESSEL_SUBSCRIPTIONS) {
        return reply({
          ok: false,
          error: {
            code: 'TOO_MANY_SUBSCRIPTIONS',
            message: `At most ${MAX_VESSEL_SUBSCRIPTIONS} vessels per connection`,
          },
        });
      }
      socket.join(room);
      socket.data.vessels.add(mmsi);
      reply({ ok: true, data: { mmsi } });
      // After the acknowledgement, like the service: the latest known position and state.
      setImmediate(() => {
        if (!socket.connected) return;
        const position = latestPositions.get(mmsi);
        if (position) socket.emit('vessel:position', position);
        const state = latestSafety.get(mmsi);
        if (state) socket.emit('vessel:safety', state);
        run('subscribe', { socket, claims, mmsi });
      });
    });

    socket.on('vessel:unsubscribe', (request, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      const parsed = VesselSubscribeRequestSchema.safeParse(request);
      if (!parsed.success) return reply(invalid(describeIssues(parsed.error)));
      const { mmsi } = parsed.data;
      if (socket.data.vessels.delete(mmsi)) socket.leave(vesselRoom(mmsi));
      reply({ ok: true, data: { mmsi } });
    });

    run('connection', { socket, claims });
  });

  return {
    api,
    /** Registers the hooks of a module (`realtime` export). */
    use(source, hooks = {}) {
      for (const name of ['connection', 'viewport', 'subscribe']) {
        if (hooks[name]) listeners[name].push({ source, hook: hooks[name] });
      }
      if (hooks.start) {
        try {
          const cleanup = hooks.start(api);
          if (typeof cleanup === 'function') cleanups.push(cleanup);
        } catch (error) {
          throw new Error(`${source}: realtime.start failed: ${error.message}`, { cause: error });
        }
      }
    },
    /** Stops timers and module hooks and closes the socket.io server (and the HTTP server). */
    close() {
      for (const timer of timers) clearInterval(timer);
      timers.clear();
      for (const cleanup of cleanups.splice(0)) cleanup();
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
