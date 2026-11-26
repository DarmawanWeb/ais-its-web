import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ZoneDto, ZoneSummaryDto } from '@/shared/api/generated/geo/model';
import type * as SharedMapModule from '@/shared/map';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

type SharedMap = typeof SharedMapModule;

// No WebGL in jsdom: the map, its layers and the drawing surface are covered by Playwright.
vi.mock('@/shared/map', async (importOriginal) => ({
  ...(await importOriginal<SharedMap>()),
  MapView: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="map" aria-label={ariaLabel} />
  ),
  MapLegend: () => null,
  MapPageLayout: ({
    title,
    topLeft,
    sidePanel,
  }: {
    title: string;
    topLeft?: ReactNode;
    sidePanel?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {topLeft}
      {sidePanel}
    </div>
  ),
}));
vi.mock('../components/maps/zone-editor-map', () => ({
  ZoneEditorMap: () => <div data-testid="editor-map" />,
}));

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [103.8, 1.12],
      [103.86, 1.12],
      [103.86, 1.16],
      [103.8, 1.16],
      [103.8, 1.12],
    ],
  ],
};

function makeZone(overrides: Partial<ZoneDto> = {}): ZoneDto {
  return {
    id: '0192f0c8-7d3a-7c2e-9a1f-000000000009',
    orgId: TEST_IDS.orgA,
    global: false,
    code: 'pelni-geofence',
    name: 'Geofence armada Sekupang',
    kind: 'custom',
    bufferM: 0,
    alertOnEnter: true,
    active: true,
    properties: { authority: 'PT Pelayaran Nusantara', markers: [] },
    source: 'Survei internal 2026',
    createdBy: TEST_IDS.user,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    etag: '"2026-11-20T10:00:00.000Z"',
    geometryType: 'Polygon',
    vertexCount: 5,
    bbox: [103.8, 1.12, 103.86, 1.16],
    geometry: square,
    ...overrides,
  } satisfies ZoneDto;
}

const globalZone = makeZone({
  id: '0192f0c8-7d3a-7c2e-9a1f-000000000004',
  orgId: null,
  global: true,
  code: 'btm-restricted',
  name: 'Area terlarang Batu Ampar',
  kind: 'restricted',
});

const summaryOf = ({ geometry: _geometry, ...zone }: ZoneDto): ZoneSummaryDto => zone;

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, title: code, status, code, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

function useZonesApi(zones: ZoneDto[] | 'error' = [makeZone(), globalZone]) {
  const deletes: { id: string; ifMatch: string | null }[] = [];
  server.use(
    http.get('*/api/v2/zones', () =>
      zones === 'error'
        ? problem(500, 'INTERNAL_ERROR')
        : HttpResponse.json({
            data: zones.map(summaryOf),
            meta: { page: 1, pageSize: 20, total: zones.length },
          }),
    ),
    http.get('*/api/v2/zones/geojson', () =>
      HttpResponse.json({
        type: 'FeatureCollection',
        features: [],
        truncated: false,
        truncatedBy: null,
        limit: 5000,
        vertexLimit: 250000,
        featureCount: 0,
        vertexCount: 0,
        zoom: 8,
        toleranceDeg: 0,
      }),
    ),
    http.delete('*/api/v2/zones/:id', ({ params, request }) => {
      deletes.push({ id: String(params.id), ifMatch: request.headers.get('if-match') });
      return deletes.length === 1 && params.id === 'conflict'
        ? problem(412, 'ZONE_VERSION_CONFLICT', { currentEtag: '"2026-11-21T00:00:00.000Z"' })
        : new HttpResponse(null, { status: 204 });
    }),
  );
  return deletes;
}

describe('zone registry', () => {
  it('lists zones read-only without zone:write', async () => {
    useZonesApi();
    renderApp({ route: '/zones', session: { roles: ['fleet_manager'] } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zona & Geofence' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Daftar zona' });
    expect(await within(table).findByText('Area terlarang Batu Ampar')).toBeInTheDocument();
    expect(within(table).getByText('Global')).toBeInTheDocument();
    expect(within(table).getByText('Organisasi saya')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Zona baru/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Impor GeoJSON/ })).not.toBeInTheDocument();
  });

  it('filters the global scope on the client', async () => {
    useZonesApi();
    renderApp({ route: '/zones?scope=global', session: { roles: ['org_admin'] } });
    const table = await screen.findByRole('table', { name: 'Daftar zona' });
    expect(await within(table).findByText('Area terlarang Batu Ampar')).toBeInTheDocument();
    expect(within(table).queryByText('Geofence armada Sekupang')).not.toBeInTheDocument();
  });

  it('deletes an organization zone with If-Match after a confirmation', async () => {
    const deletes = useZonesApi();
    renderApp({ route: '/zones', session: { roles: ['org_admin'] } });
    expect(await screen.findByRole('link', { name: /Zona baru/ })).toBeInTheDocument();
    // a global zone is not writable by an organization admin: no delete action
    await userEvent.click(
      await screen.findByRole('button', { name: 'Aksi untuk Area terlarang Batu Ampar' }),
    );
    expect(screen.queryByRole('menuitem', { name: /Hapus/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Aksi untuk Geofence armada Sekupang' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: /Hapus/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hapus' }));
    await waitFor(() =>
      expect(deletes).toEqual([{ id: makeZone().id, ifMatch: '"2026-11-20T10:00:00.000Z"' }]),
    );
    expect(await screen.findByText('Zona Geofence armada Sekupang dihapus')).toBeInTheDocument();
  });

  it('explains an empty registry and shows errors', async () => {
    useZonesApi([]);
    const first = renderApp({ route: '/zones', session: { roles: ['org_admin'] } });
    expect(await screen.findByText('Belum ada zona')).toBeInTheDocument();
    first.unmount();
    useZonesApi('error');
    renderApp({ route: '/zones' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('zone editor', () => {
  // Desktop layout: the properties panel opens beside the map (jsdom matches no media query).
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  function useZoneDetail(
    zone: ZoneDto,
    patch: (request: Request, call: number) => Response | Promise<Response>,
  ) {
    const calls: { body: unknown; ifMatch: string | null }[] = [];
    useZonesApi([zone]);
    server.use(
      http.get('*/api/v2/zones/:id', () =>
        HttpResponse.json(zone, { headers: { ETag: `"${zone.updatedAt}"` } }),
      ),
      http.patch('*/api/v2/zones/:id', async ({ request }) => {
        const clone = request.clone();
        calls.push({ body: await clone.json(), ifMatch: request.headers.get('if-match') });
        return patch(request, calls.length);
      }),
    );
    return calls;
  }

  it('saves changed fields with If-Match', async () => {
    const zone = makeZone();
    const calls = useZoneDetail(zone, async (request) => {
      const body = (await request.json()) as Partial<ZoneDto>;
      const next = { ...zone, ...body, updatedAt: '2026-11-22T00:00:00.000Z' };
      return HttpResponse.json(next, { headers: { ETag: `"${next.updatedAt}"` } });
    });
    renderApp({ route: `/zones/${zone.id}`, session: { roles: ['org_admin'] } });
    const name = await screen.findByLabelText('Nama');
    await userEvent.clear(name);
    await userEvent.type(name, 'Geofence armada Batu Ampar');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
    await waitFor(() =>
      expect(calls).toEqual([
        { body: { name: 'Geofence armada Batu Ampar' }, ifMatch: '"2026-11-20T10:00:00.000Z"' },
      ]),
    );
    expect(
      await screen.findByText('Perubahan zona Geofence armada Batu Ampar disimpan'),
    ).toBeInTheDocument();
    expect(screen.getByText('"2026-11-22T00:00:00.000Z"')).toBeInTheDocument();
  });

  it('resolves a version conflict by overwriting with the current ETag', async () => {
    const zone = makeZone();
    const calls = useZoneDetail(zone, (_request, call) =>
      call === 1
        ? problem(412, 'ZONE_VERSION_CONFLICT', { currentEtag: '"2026-11-21T08:00:00.000Z"' })
        : HttpResponse.json({ ...zone, bufferM: 250, updatedAt: '2026-11-22T00:00:00.000Z' }),
    );
    renderApp({ route: `/zones/${zone.id}`, session: { roles: ['org_admin'] } });
    const buffer = await screen.findByLabelText('Buffer');
    await userEvent.clear(buffer);
    await userEvent.type(buffer, '250');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
    const dialog = await screen.findByRole('alertdialog', { name: /diubah orang lain/ });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Timpa dengan perubahan saya' }),
    );
    await waitFor(() =>
      expect(calls.map((call) => call.ifMatch)).toEqual([
        '"2026-11-20T10:00:00.000Z"',
        '"2026-11-21T08:00:00.000Z"',
      ]),
    );
    expect(calls[1]?.body).toEqual({ bufferM: 250 });
  });

  it('maps geometry problems of the service to a friendly message', async () => {
    const zone = makeZone();
    useZoneDetail(zone, () =>
      problem(422, 'ZONE_GEOMETRY_INVALID', { detail: 'Self-intersection [103.83 1.14]' }),
    );
    renderApp({ route: `/zones/${zone.id}`, session: { roles: ['org_admin'] } });
    await userEvent.type(await screen.findByLabelText('Catatan'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
    expect(
      await screen.findByText(
        /Geometri tidak valid menurut PostGIS: Self-intersection \[103.83 1.14\]/,
        {
          selector: 'li span',
        },
      ),
    ).toBeInTheDocument();
  });

  it('is read-only for global zones of organization users', async () => {
    useZoneDetail(globalZone, () => HttpResponse.json(globalZone));
    renderApp({ route: `/zones/${globalZone.id}`, session: { roles: ['org_admin'] } });
    expect(
      await screen.findByText(/hanya dapat diubah oleh super admin atau otoritas/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nama')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Simpan perubahan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Alat gambar' })).not.toBeInTheDocument();
  });

  it('creates a point zone from typed coordinates', async () => {
    useZonesApi([]);
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/v2/zones', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if (bodies.length === 1) return problem(409, 'ZONE_CODE_TAKEN');
        const created = makeZone({
          ...(body as Partial<ZoneDto>),
          id: '0192f0c8-7d3a-7c2e-9a1f-000000000099',
        });
        return HttpResponse.json(created, {
          status: 201,
          headers: { ETag: `"${created.updatedAt}"` },
        });
      }),
      http.get('*/api/v2/zones/:id', () =>
        HttpResponse.json(makeZone({ id: '0192f0c8-7d3a-7c2e-9a1f-000000000099' })),
      ),
    );
    const { router } = renderApp({ route: '/zones/new', session: { roles: ['org_admin'] } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Zona baru' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nama'), 'Titik Pantau Belakang Padang');
    expect(screen.getByLabelText('Kode')).toHaveValue('titik-pantau-belakang-padang');
    await userEvent.type(screen.getByLabelText('Lintang'), '1.1652');
    await userEvent.type(screen.getByLabelText('Bujur'), '104.0154');
    await userEvent.click(screen.getByRole('button', { name: 'Tambah titik' }));
    expect(screen.getByLabelText('Buffer')).toHaveValue('500');
    await userEvent.click(screen.getByRole('button', { name: 'Buat zona' }));
    // the field shows the message (the toast repeats it)
    await waitFor(() =>
      expect(screen.getByLabelText('Kode')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      screen.getAllByText('Kode ini sudah dipakai zona lain pada cakupan yang sama.').length,
    ).toBeGreaterThan(0);
    expect(bodies[0]).toMatchObject({
      code: 'titik-pantau-belakang-padang',
      kind: 'custom',
      bufferM: 500,
      geometry: { type: 'Point', coordinates: [104.0154, 1.1652] },
    });
    expect(bodies[0]).not.toHaveProperty('global');
    await userEvent.clear(screen.getByLabelText('Kode'));
    await userEvent.type(screen.getByLabelText('Kode'), 'titik-pantau-2');
    await userEvent.click(screen.getByRole('button', { name: 'Buat zona' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/zones/0192f0c8-7d3a-7c2e-9a1f-000000000099'),
    );
  });
});
