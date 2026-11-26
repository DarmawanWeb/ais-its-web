import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AlertPageDto } from '@/shared/api/generated/notification/model';
import type { SafetyVesselStateDto } from '@/shared/api/generated/safety/model';
import { realtime } from '@/shared/realtime/client';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/msw/server';

import type * as SharedMap from '@/shared/map';

import { MapControls } from '../components/map-controls';
import { VesselPanel } from '../components/vessel-panel';
import { useLiveMapStore } from '../hooks/use-live-map-store';

// MapLibre needs WebGL (not in jsdom): the MapView is a stub; panels around it are tested.
vi.mock('@/shared/map', async (importOriginal) => ({
  ...(await importOriginal<typeof SharedMap>()),
  MapView: ({ children: _children }: { children?: ReactNode }) => <div data-testid="map-canvas" />,
}));

const MMSI = 525005223;
const now = new Date().toISOString();

function seedLiveVessel() {
  realtime.vessels.upsertPositions([
    {
      mmsi: MMSI,
      time: now,
      lat: 1.152,
      lon: 103.902,
      sog: 9.8,
      cog: 248,
      hdg: 248,
      navstatus: 0,
      predictedNavstatus: 0,
      source: 'batam',
      vessel: { id: 'v1', name: 'KM Bahari Nusantara', typeCode: 'tanker' },
    },
  ]);
  realtime.vessels.upsertSafetyStates([
    {
      mmsi: MMSI,
      time: now,
      lat: 1.152,
      lon: 103.902,
      ewsStatus: 0,
      collisionRisk: 'none',
      closestEncounter: null,
    },
  ]);
}

function mockVesselApis() {
  server.use(
    http.get('*/api/v2/vessels/by-mmsi/:mmsi', () =>
      HttpResponse.json({
        view: 'detail',
        id: 'v1',
        mmsi: MMSI,
        imo: '9123456',
        name: 'KM Bahari Nusantara',
        flag: 'ID',
        type: { id: 't1', code: 'tanker', name: 'Tanker' },
        status: 'active',
        photoUrl: null,
        updatedAt: now,
        orgId: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
      }),
    ),
    http.get('*/api/v2/safety/vessels/:mmsi', () =>
      HttpResponse.json({
        mmsi: MMSI,
        time: now,
        lat: 1.152,
        lon: 103.902,
        positionTime: now,
        sog: 0.1,
        cog: 248,
        hdg: 248,
        navstatus: 1,
        predictedNavstatus: 1,
        ewsStatus: 0,
        pipelineDistanceM: 102.6,
        nearestPipelineZoneId: 'zone-1',
        nearestPipeline: null,
        collisionRisk: 'none',
        closestEncounter: null,
        methodIds: [],
        vessel: { id: 'v1', name: 'KM Bahari Nusantara', typeCode: 'tanker' },
        updatedAt: now,
      } satisfies SafetyVesselStateDto),
    ),
    http.get('*/api/v2/zones/:id', () =>
      HttpResponse.json({ id: 'zone-1', name: 'Pipa Gas Batam' }),
    ),
    http.get('*/api/v2/alerts', () =>
      HttpResponse.json({
        data: [
          {
            id: 'a1',
            type: 'ews',
            domain: 'safety',
            severity: 'critical',
            status: 'open',
            mmsi: MMSI,
            relatedMmsi: null,
            orgId: null,
            title: 'Bahaya EWS: KM Bahari Nusantara',
            message: '',
            lat: null,
            lon: null,
            zoneId: null,
            methodId: 'ews.pipeline_distance_status',
            dedupKey: 'k',
            messageKey: null,
            messageParams: {},
            resolutionReason: null,
            resolutionMessageKey: null,
            resolutionMessageParams: {},
            resolutionEventId: null,
            data: {},
            source: 'safety',
            occurrences: 1,
            occurredAt: now,
            lastOccurredAt: now,
            acknowledgedBy: null,
            acknowledgedAt: null,
            resolvedBy: null,
            resolvedAt: null,
            updatedAt: now,
          },
        ],
        page: { nextCursor: null, limit: 5 },
      } satisfies AlertPageDto),
    ),
  );
}

afterEach(() => realtime.vessels.clear());

describe('VesselPanel', () => {
  it('shows identity, kinematics, safety with methods, alerts and links', async () => {
    seedLiveVessel();
    mockVesselApis();
    renderWithProviders(<VesselPanel mmsi={MMSI} />, { session: { roles: ['fleet_manager'] } });
    expect(await screen.findByTestId('vessel-panel-name')).toHaveTextContent('KM Bahari Nusantara');
    expect(await screen.findByText('Armada Anda')).toBeInTheDocument();
    expect(screen.getByText('IMO 9123456')).toBeInTheDocument();
    expect(screen.getByText('Bahaya')).toBeInTheDocument();
    expect(await screen.findByText('Pipa Gas Batam')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Sumber metode/ }).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      await screen.findByRole('link', { name: /Bahaya EWS: KM Bahari Nusantara/ }),
    ).toHaveAttribute('href', '/alerts?alert=a1&status=all');
    expect(screen.getByRole('link', { name: /Halaman kapal/ })).toHaveAttribute(
      'href',
      `/vessels/${MMSI}`,
    );
    expect(screen.getByRole('link', { name: /Emisi & CII/ })).toHaveAttribute(
      'href',
      `/cii?mmsi=${MMSI}`,
    );
  });

  it('hides tenant-private links from roles without the permission', async () => {
    seedLiveVessel();
    mockVesselApis();
    renderWithProviders(<VesselPanel mmsi={MMSI} />, { session: { roles: ['authority'] } });
    expect(await screen.findByRole('link', { name: /Halaman kapal/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Emisi & CII/ })).not.toBeInTheDocument();
  });

  it('marks vessels outside the fleet registry and waits for a position', async () => {
    server.use(
      http.get('*/api/v2/vessels/by-mmsi/:mmsi', () =>
        HttpResponse.json(
          { status: 404, code: 'VESSEL_NOT_FOUND', title: 'Vessel not found' },
          { status: 404 },
        ),
      ),
    );
    renderWithProviders(<VesselPanel mmsi={999999999} />);
    expect(await screen.findByText('Tidak terdaftar di armada')).toBeInTheDocument();
    expect(screen.getByText('Menunggu data posisi kapal ini…')).toBeInTheDocument();
  });
});

describe('MapControls', () => {
  it('toggles layers and filters in the map state', async () => {
    const user = userEvent.setup();
    useLiveMapStore.getState().initFromUrl({
      center: null,
      zoom: null,
      vessel: null,
      layers: ['vessels'],
      sources: ['primary', 'batam', 'pusher'],
    });
    renderWithProviders(<MapControls />);
    // Folded on narrow screens (jsdom has no media queries): open it first.
    await user.click(screen.getByTestId('map-controls-toggle'));
    await user.click(screen.getByTestId('layer-heatmap'));
    expect(useLiveMapStore.getState().layers.has('heatmap')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Batam' }));
    expect(useLiveMapStore.getState().sources.has('batam')).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Filter' }));
    await user.click(screen.getByRole('checkbox', { name: 'Normal' }));
    expect(useLiveMapStore.getState().safety?.has('normal')).toBe(false);
    expect(screen.getByTestId('map-controls-toggle')).toHaveTextContent('2 filter');
    await user.click(screen.getByRole('button', { name: 'Atur ulang filter' }));
    expect(useLiveMapStore.getState().safety).toBeNull();
  });
});

describe('LiveMapPage', () => {
  it(
    'restores the selected vessel from the URL and offers search, layers and legend',
    { timeout: 30_000 },
    async () => {
      const user = userEvent.setup();
      seedLiveVessel();
      mockVesselApis();
      server.use(
        http.get('*/api/v2/vessels', () =>
          HttpResponse.json({ data: [], meta: { page: 1, pageSize: 6, total: 0 } }),
        ),
      );
      renderApp({
        route: `/map?vessel=${MMSI}&layers=vessels,events`,
        session: { roles: ['fleet_manager'] },
      });
      // The lazy map page pulls MapLibre and deck.gl: the first import takes a while. On a narrow
      // screen (jsdom) the vessel panel is a modal drawer, so the page behind it is aria-hidden.
      const panel = await screen.findByTestId('vessel-panel', {}, { timeout: 15_000 });
      expect(
        screen.getByRole('heading', { level: 1, name: 'Peta Live', hidden: true }),
      ).toBeInTheDocument();
      expect(within(panel).getByTestId('vessel-panel-name')).toHaveTextContent(
        'KM Bahari Nusantara',
      );

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByTestId('vessel-panel')).not.toBeInTheDocument());
      expect(useLiveMapStore.getState().selectedMmsi).toBeNull();

      await user.click(screen.getByTestId('map-controls-toggle'));
      expect(screen.getByTestId('layer-events')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('layer-zones')).toHaveAttribute('aria-checked', 'false');

      await user.type(screen.getByTestId('map-search'), 'bahari');
      expect(
        await screen.findByRole('option', { name: /KM Bahari Nusantara/ }),
      ).toBeInTheDocument();

      await user.click(
        within(screen.getByTestId('map-legend')).getByRole('button', { name: /Legenda/ }),
      );
      expect(screen.getByText('Kapal terpilih')).toBeInTheDocument();
    },
  );
});
