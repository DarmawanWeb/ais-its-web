import { describe, expect, it } from 'vitest';

import {
  buildRouteTable,
  can,
  compilePath,
  cursorPageOf,
  MockHttpError,
  pageOf,
  validateModule,
} from './lib.mjs';
import * as example from './routes/_example.mjs';

const handler = () => undefined;
const route = (method, path, extra = {}) => ({ method, path, handler, ...extra });

describe('compilePath', () => {
  it('matches literal segments and decodes :params', () => {
    const { match, key } = compilePath('/api/v2/zones/:id/vertices/:index');
    expect(key).toBe('/api/v2/zones/:/vertices/:');
    expect(match('/api/v2/zones/a%20b/vertices/3')).toEqual({ id: 'a b', index: '3' });
    expect(match('/api/v2/zones/a/vertices')).toBeNull();
    expect(match('/api/v2/zones/a/edges/3')).toBeNull();
    expect(match('/api/v2/zones/%E0%A4%A/vertices/3')).toBeNull();
  });

  it('keeps exact paths and RegExps with named groups', () => {
    expect(compilePath('/api/v2/ais/stats').match('/api/v2/ais/stats')).toEqual({});
    expect(compilePath('/api/v2/ais/stats').match('/api/v2/ais/stats/x')).toBeNull();
    const regexp = compilePath(/^\/api\/v2\/vessels\/by-mmsi\/(?<mmsi>\d{9})$/);
    expect(regexp.match('/api/v2/vessels/by-mmsi/525005223')).toEqual({ mmsi: '525005223' });
  });

  it('rejects malformed paths and parameters', () => {
    expect(() => compilePath('api/v2/zones')).toThrow(/starting with "\/"/);
    expect(() => compilePath('/api/v2/zones/:')).toThrow(/invalid parameter/);
    expect(() => compilePath('/api/v2/zones/:id-x')).toThrow(/invalid parameter/);
  });
});

describe('buildRouteTable', () => {
  const resolve = (routes, method, path) =>
    routes.find((r) => r.method === method && r.match(path))?.source ?? null;

  it('prefers literal segments over parameters whatever the file order', () => {
    const { routes } = buildRouteTable([
      { layer: 'feature', source: 'routes/a.mjs', routes: [route('GET', '/api/v2/zones/:id')] },
      { layer: 'feature', source: 'routes/b.mjs', routes: [route('GET', '/api/v2/zones/geojson')] },
      { layer: 'base', source: 'base/x.mjs', routes: [route('GET', /^\/api\/v2\/zones\/.*$/)] },
    ]);
    expect(resolve(routes, 'GET', '/api/v2/zones/geojson')).toBe('routes/b.mjs');
    expect(resolve(routes, 'GET', '/api/v2/zones/0192')).toBe('routes/a.mjs');
    expect(resolve(routes, 'GET', '/api/v2/zones/0192/x')).toBe('base/x.mjs');
    expect(resolve(routes, 'POST', '/api/v2/zones/0192')).toBeNull();
  });

  it('lets a feature replace a base route and reports it', () => {
    const { routes, overrides } = buildRouteTable([
      {
        layer: 'feature',
        source: 'routes/vessels.mjs',
        routes: [route('GET', '/api/v2/vessels/:id')],
      },
      {
        layer: 'base',
        source: 'base/fleet.mjs',
        routes: [route('GET', '/api/v2/vessels/:vesselId')],
      },
    ]);
    expect(routes).toHaveLength(1);
    expect(resolve(routes, 'GET', '/api/v2/vessels/1')).toBe('routes/vessels.mjs');
    expect(overrides).toEqual([
      { key: 'GET /api/v2/vessels/:', source: 'routes/vessels.mjs', replaced: 'base/fleet.mjs' },
    ]);
  });

  it('rejects the same route in two feature modules and features on core routes', () => {
    expect(() =>
      buildRouteTable([
        { layer: 'feature', source: 'routes/a.mjs', routes: [route('GET', '/api/v2/x/:id')] },
        { layer: 'feature', source: 'routes/b.mjs', routes: [route('GET', '/api/v2/x/:key')] },
      ]),
    ).toThrow('GET /api/v2/x/: is declared by routes/a.mjs and routes/b.mjs');
    expect(() =>
      buildRouteTable([
        { layer: 'core', source: 'server.mjs', routes: [route('POST', '/api/v2/auth/login')] },
        { layer: 'feature', source: 'routes/a.mjs', routes: [route('POST', '/api/v2/auth/login')] },
      ]),
    ).toThrow(/reserved by the mock core/);
  });

  it('rejects routes without method, path or handler', () => {
    expect(() =>
      buildRouteTable([{ layer: 'feature', source: 'routes/a.mjs', routes: [{ path: '/x' }] }]),
    ).toThrow(/routes\/a\.mjs: every route needs method/);
    expect(() =>
      buildRouteTable([{ layer: 'feature', source: 'routes/a.mjs', routes: [route('GET', 'x')] }]),
    ).toThrow(/routes\/a\.mjs: invalid path/);
  });
});

describe('validateModule', () => {
  it('accepts the empty example module', () => {
    const module = validateModule(example, 'routes/_example.mjs');
    expect(module.routes).toEqual([]);
    expect(module.realtime).toEqual({});
    expect(typeof module.reset).toBe('function');
  });

  it('rejects modules without known exports, unknown hooks and wrong types', () => {
    expect(() => validateModule({ route: [] }, 'routes/a.mjs')).toThrow(/exports none of/);
    expect(() => validateModule({ routes: {} }, 'routes/a.mjs')).toThrow(/must be an array/);
    expect(() => validateModule({ realtime: { onConnect() {} } }, 'routes/a.mjs')).toThrow(
      /unknown realtime hook "onConnect"/,
    );
    expect(() => validateModule({ realtime: { start: 1 } }, 'routes/a.mjs')).toThrow(
      /realtime\.start must be a function/,
    );
  });
});

describe('lists and permissions', () => {
  const items = Array.from({ length: 45 }, (_, index) => index);
  const url = (query) => new URL(`http://mock/api/v2/x?${query}`);

  it('pages like spec §5 and rejects invalid queries', () => {
    expect(pageOf(items, url('page=3&pageSize=20&search=x'))).toEqual({
      data: [40, 41, 42, 43, 44],
      meta: { page: 3, pageSize: 20, total: 45 },
    });
    expect(() => pageOf(items, url('pageSize=101'))).toThrow(MockHttpError);
  });

  it('pages by cursor', () => {
    const first = cursorPageOf(items, url('limit=40'));
    expect(first.data).toHaveLength(40);
    const second = cursorPageOf(items, url(`limit=40&cursor=${first.page.nextCursor}`));
    expect(second).toEqual({ data: [40, 41, 42, 43, 44], page: { nextCursor: null, limit: 40 } });
    expect(() => cursorPageOf(items, url('cursor=nope'))).toThrow(MockHttpError);
  });

  it('checks permissions with the contracts role matrix', () => {
    expect(can({ roles: ['viewer'] }, 'zone:read')).toBe(true);
    expect(can({ roles: ['viewer'] }, 'zone:write')).toBe(false);
    expect(can({ roles: ['viewer'] }, ['zone:write', 'zone:read'])).toBe(true);
    expect(can({ roles: ['super_admin'] }, 'org:manage')).toBe(true);
    expect(can(null, 'zone:read')).toBe(false);
  });
});
