import { http, HttpResponse } from 'msw';

import type {
  CreateVesselDto,
  UpdateVesselDto,
  VesselDetailDto,
} from '@/shared/api/generated/fleet/model';
import { server } from '@/test/msw/server';

import {
  ALERT,
  AUX_ENGINE,
  CII_CURRENT,
  DIESEL,
  FLEET_SUMMARY,
  FORMULA,
  LATEST,
  MAIN_ENGINE,
  pageOf,
  PORTS,
  RORO,
  TANKER,
  TELEMETRY_STATUS,
  TELEMETRY_SUMMARY,
  VESSEL_DETAIL,
  VESSEL_SUMMARY,
} from './fixtures';

const problem = (status: number, code: string, title: string) =>
  HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, status, code, title },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

export interface FleetMock {
  created: CreateVesselDto[];
  patched: UpdateVesselDto[];
  listParams: URLSearchParams[];
}

/** MSW handlers of the fleet, AIS, emission, telemetry and alerts endpoints the pages call. */
export function mockFleet(
  options: {
    vessels?: (VesselDetailDto | typeof VESSEL_SUMMARY)[];
    listError?: boolean;
    patchProblem?: { status: number; code: string; title: string };
  } = {},
): FleetMock {
  const vessels = options.vessels ?? [VESSEL_DETAIL, VESSEL_SUMMARY];
  const mock: FleetMock = { created: [], patched: [], listParams: [] };
  server.use(
    http.get('*/api/v2/vessels', ({ request }) => {
      const params = new URL(request.url).searchParams;
      mock.listParams.push(params);
      if (options.listError) return problem(503, 'SERVICE_UNAVAILABLE', 'Service unavailable');
      const status = params.get('status');
      const items = vessels.filter((vessel) => !status || vessel.status === status);
      const pageSize = Number(params.get('pageSize') ?? 20);
      return HttpResponse.json(pageOf(items.slice(0, pageSize), 1, pageSize, items.length));
    }),
    http.get('*/api/v2/vessels/by-mmsi/:mmsi', ({ params }) => {
      const vessel = vessels.find((item) => String(item.mmsi) === params.mmsi);
      return vessel
        ? HttpResponse.json(vessel)
        : problem(404, 'VESSEL_NOT_FOUND', 'Vessel not found');
    }),
    http.post('*/api/v2/vessels', async ({ request }) => {
      const body = (await request.json()) as CreateVesselDto;
      mock.created.push(body);
      return HttpResponse.json(
        { ...VESSEL_DETAIL, mmsi: body.mmsi, name: body.name },
        { status: 201 },
      );
    }),
    http.patch('*/api/v2/vessels/:id', async ({ request }) => {
      const body = (await request.json()) as UpdateVesselDto;
      mock.patched.push(body);
      if (options.patchProblem) {
        const { status, code, title } = options.patchProblem;
        return problem(status, code, title);
      }
      return HttpResponse.json({ ...VESSEL_DETAIL, ...body });
    }),
    http.get('*/api/v2/vessel-types', () => HttpResponse.json(pageOf([TANKER, RORO]))),
    http.get('*/api/v2/fuels', () => HttpResponse.json(pageOf([DIESEL]))),
    http.get('*/api/v2/engines', ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind');
      return HttpResponse.json(
        pageOf([MAIN_ENGINE, AUX_ENGINE].filter((e) => !kind || e.kind === kind)),
      );
    }),
    http.get('*/api/v2/fuel-formulas', () => HttpResponse.json(pageOf([FORMULA]))),
    http.get('*/api/v2/ports', () => HttpResponse.json(pageOf(PORTS))),
    http.get('*/api/v2/ais/latest', ({ request }) => {
      const mmsis = new URL(request.url).searchParams.get('mmsi')?.split(',') ?? [];
      return HttpResponse.json(mmsis.includes(String(LATEST.mmsi)) ? [LATEST] : []);
    }),
    http.get('*/api/v2/ais/vessels/:mmsi/latest', ({ params }) =>
      String(params.mmsi) === String(LATEST.mmsi)
        ? HttpResponse.json(LATEST)
        : problem(404, 'AIS_POSITION_NOT_FOUND', 'AIS position not found'),
    ),
    http.get('*/api/v2/cii/fleet/summary', () => HttpResponse.json(FLEET_SUMMARY)),
    http.get('*/api/v2/cii/vessels/:mmsi/current', () => HttpResponse.json(CII_CURRENT)),
    http.get('*/api/v2/cii/vessels/:mmsi/daily', () =>
      HttpResponse.json({
        mmsi: VESSEL_DETAIL.mmsi,
        from: '2026-01-01',
        to: '2026-11-22',
        points: [],
        methodIds: [],
      }),
    ),
    http.get('*/api/v2/telemetry/vessels/:mmsi/status', () => HttpResponse.json(TELEMETRY_STATUS)),
    http.get('*/api/v2/telemetry/vessels/:mmsi/summary', () =>
      HttpResponse.json(TELEMETRY_SUMMARY),
    ),
    http.get('*/api/v2/telemetry/vessels/:mmsi/readings', () =>
      HttpResponse.json({ data: [], page: { nextCursor: null, limit: 60 } }),
    ),
    http.get('*/api/v2/alerts', () =>
      HttpResponse.json({ data: [ALERT], page: { nextCursor: null, limit: 20 } }),
    ),
  );
  return mock;
}
