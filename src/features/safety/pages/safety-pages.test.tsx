import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type {
  DetectorDescriptionDto,
  EncounterDto,
  SafetyEventDto,
  SafetyVesselStateDto,
} from '@/shared/api/generated/safety/model';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';

// MapLibre needs WebGL (not in jsdom): the maps are replaced; the pages around them are tested.
vi.mock('../components/ews-map', () => ({ EwsMap: () => <div data-testid="ews-map" /> }));
vi.mock('../components/encounter-map', () => ({
  EncounterMap: () => <div data-testid="encounter-map" />,
}));

const now = new Date().toISOString();

const state = (
  mmsi: number,
  name: string,
  ewsStatus: 0 | 1 | 3,
  distance: number | null,
  collisionRisk = 'none',
): SafetyVesselStateDto =>
  ({
    mmsi,
    time: now,
    lat: 1.15,
    lon: 103.9,
    positionTime: now,
    sog: 0.1,
    cog: 0,
    hdg: 511,
    navstatus: 1,
    predictedNavstatus: 1,
    ewsStatus,
    pipelineDistanceM: distance,
    nearestPipelineZoneId: distance === null ? null : 'zone-1',
    collisionRisk,
    closestEncounter: null,
    methodIds: ['ews.pipeline_distance_status'],
    vessel: { id: `v-${mmsi}`, name },
    updatedAt: now,
  }) as SafetyVesselStateDto;

const STATES = [
  state(525019003, 'KM Kepri Indah', 1, 610.4),
  state(525005223, 'KM Bahari Nusantara', 0, 102.6),
];

const DETECTORS: DetectorDescriptionDto[] = [
  {
    id: 'ews',
    domain: 'safety',
    methodIds: ['ews.pipeline_distance_status'],
    alertTypes: ['ews'],
    enabled: true,
    config: { DANGER_M: 500, WARNING_M: 1750 },
    tickIntervalMs: null,
  },
  {
    id: 'collision',
    domain: 'safety',
    methodIds: ['collision.cpa_tcpa'],
    alertTypes: ['collision'],
    enabled: true,
    config: { HIGH_CPA_NM: 0.25, HIGH_TCPA_MIN: 6 },
    tickIntervalMs: 30_000,
  },
];

const EVENT: SafetyEventDto = {
  id: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e01',
  time: now,
  detector: 'ews',
  type: 'ews',
  domain: 'safety',
  severity: 'critical',
  currentSeverity: 'critical',
  status: 'open',
  mmsi: 525005223,
  relatedMmsi: null,
  vessel: { id: 'v1', name: 'KM Bahari Nusantara', typeCode: 'tanker' },
  relatedVessel: null,
  zoneId: 'zone-1',
  lat: 1.15,
  lon: 103.9,
  title: 'EWS danger: KM Bahari Nusantara',
  message: 'KM Bahari Nusantara is predicted at anchor 103 m from pipeline',
  methodId: 'ews.pipeline_distance_status',
  dedupKey: 'ews:525005223:zone-1',
  data: { pipelineDistanceM: 102.6 },
  openedAt: now,
  lastSeenAt: now,
  resolvedAt: null,
  resolution: null,
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const sample = (minutes: number, cpaNm: number, tcpaMin: number, risk: string) => ({
  time: minutesAgo(minutes),
  cpaNm,
  tcpaMin,
  rangeNm: 2,
  risk,
  positions: {
    a: { mmsi: 525019001, time: minutesAgo(minutes), lat: 1.2, lon: 103.83, sog: 18, cog: 72 },
    b: { mmsi: 525019005, time: minutesAgo(minutes), lat: 1.25, lon: 103.86, sog: 13, cog: 160 },
  },
});

const ENCOUNTER: EncounterDto = {
  encounterId: '0192f0c8-7d3a-7c2e-9a1e-00000000e001',
  mmsiA: 525019001,
  mmsiB: 525019005,
  startedAt: minutesAgo(10),
  lastSampleAt: minutesAgo(0),
  peakRisk: 'high',
  minCpaNm: 0.06,
  history: [sample(10, 0.7, 14, 'low'), sample(5, 0.3, 9, 'medium'), sample(0, 0.06, 5.8, 'high')],
} as EncounterDto;

function mockSafety({
  states = STATES,
  events = [EVENT],
  encounters = [ENCOUNTER],
}: {
  states?: SafetyVesselStateDto[];
  events?: SafetyEventDto[];
  encounters?: EncounterDto[];
} = {}) {
  server.use(
    http.get('*/api/v2/safety/vessels', () => HttpResponse.json(states)),
    http.get('*/api/v2/safety/detectors', () => HttpResponse.json(DETECTORS)),
    http.get('*/api/v2/safety/events', () =>
      HttpResponse.json({ data: events, page: { nextCursor: null, limit: 15 } }),
    ),
    http.get('*/api/v2/safety/encounters', () =>
      HttpResponse.json({ data: encounters, page: { nextCursor: null, limit: 20 } }),
    ),
    http.get('*/api/v2/zones/geojson', () =>
      HttpResponse.json({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'zone-1',
            geometry: {
              type: 'LineString',
              coordinates: [
                [103.8, 1.1],
                [103.95, 1.2],
              ],
            },
            properties: {
              id: 'zone-1',
              orgId: null,
              global: true,
              code: 'pipa',
              name: 'Pipa Gas Batam',
              kind: 'pipeline',
              bufferM: 1750,
              alertOnEnter: false,
              active: true,
              updatedAt: now,
              zoneProperties: {},
            },
          },
        ],
        truncated: false,
        truncatedBy: null,
        limit: 2000,
        vertexLimit: 200000,
        featureCount: 1,
        vertexCount: 2,
        zoom: null,
        toleranceDeg: 0,
      }),
    ),
  );
}

/** The app shell and the lazy page can take a while on a busy machine. */
const APP = { timeout: 10_000 };

describe('EwsPage', { timeout: 30_000 }, () => {
  it('lists vessels near pipelines (danger first), the events and the rule', async () => {
    mockSafety();
    renderApp({ route: '/safety/ews' });
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Peringatan Dini Pipa Bawah Laut' },
        APP,
      ),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Kapal di sekitar pipa' });
    const rows = await within(table).findAllByRole('row');
    expect(rows[1]).toHaveTextContent('KM Bahari Nusantara');
    expect(rows[1]).toHaveTextContent('Bahaya');
    expect(rows[2]).toHaveTextContent('KM Kepri Indah');
    expect(screen.getByTestId('ews-map')).toBeInTheDocument();
    const events = await screen.findByRole('table', { name: 'Riwayat kejadian EWS' });
    expect(await within(events).findByText('Kritis')).toBeInTheDocument();
    expect(await screen.findByText('Jarak < 500 m')).toBeInTheDocument();
    expect(screen.getByText('Ambang aktif detektor')).toBeInTheDocument();
  });

  it('explains when no vessel is near a pipeline', async () => {
    mockSafety({ states: [], events: [] });
    renderApp({ route: '/safety/ews' });
    expect(
      await screen.findByText('Tidak ada kapal dengan status ini', {}, APP),
    ).toBeInTheDocument();
    expect(await screen.findByText('Belum ada kejadian EWS')).toBeInTheDocument();
  });

  it('shows the problem when the safety service fails', async () => {
    mockSafety();
    server.use(
      http.get('*/api/v2/safety/vessels', () =>
        HttpResponse.json(
          { status: 500, code: 'INTERNAL_ERROR', title: 'Internal error' },
          { status: 500 },
        ),
      ),
    );
    renderApp({ route: '/safety/ews' });
    expect(
      (await screen.findAllByRole('button', { name: 'Coba lagi' }, APP)).length,
    ).toBeGreaterThan(0);
  });

  it('filters by EWS status through the URL', async () => {
    const user = userEvent.setup();
    let requested = '';
    mockSafety();
    server.use(
      http.get('*/api/v2/safety/vessels', ({ request }) => {
        requested = new URL(request.url).searchParams.get('ewsStatus') ?? '';
        return HttpResponse.json(STATES);
      }),
    );
    const { router } = renderApp({ route: '/safety/ews' });
    await user.click(await screen.findByTestId('ews-filter-3', {}, APP));
    await vi.waitFor(() => expect(requested).toBe('0,1,3'));
    expect(router.state.location.search).toContain('status=0%2C1%2C3');
  });
});

describe('CollisionPage', { timeout: 30_000 }, () => {
  it('lists encounters with peak risk, minimum CPA and TCPA and the risk bands', async () => {
    mockSafety({
      states: [
        state(525019001, 'MV Batam Express', 3, null, 'high'),
        state(525019005, 'LNG Natuna', 3, null, 'high'),
      ],
    });
    renderApp({ route: '/safety/collision' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Risiko Tubrukan (CPA/TCPA)' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Pertemuan kapal' });
    expect(await within(table).findByText('MV Batam Express')).toBeInTheDocument();
    expect(within(table).getByText('Risiko tinggi')).toBeInTheDocument();
    expect(within(table).getByText('0,06')).toBeInTheDocument();
    expect(screen.getByText('CPA < 0,25 nm · TCPA < 6 mnt')).toBeInTheDocument();
  });

  it('opens the encounter detail from the URL with its history', async () => {
    mockSafety();
    renderApp({ route: `/safety/collision?encounter=${ENCOUNTER.encounterId}` });
    const detail = await screen.findByTestId('encounter-detail', {}, APP);
    expect(await within(detail).findByText('Riwayat CPA/TCPA')).toBeInTheDocument();
    expect(
      within(detail).getByRole('table', { name: 'Sampel CPA/TCPA pertemuan' }),
    ).toBeInTheDocument();
    expect(await within(detail).findByTestId('encounter-map')).toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: /Alert tubrukan terkait/ })).toHaveAttribute(
      'href',
      '/alerts?type=collision&mmsi=525019001&status=all',
    );
  });

  it('explains an empty range and a failed list', async () => {
    mockSafety({ encounters: [] });
    renderApp({ route: '/safety/collision' });
    expect(await screen.findByText('Tidak ada pertemuan berisiko', {}, APP)).toBeInTheDocument();
  });

  it('shows the problem of a failed encounter list', async () => {
    mockSafety();
    server.use(
      http.get('*/api/v2/safety/encounters', () =>
        HttpResponse.json(
          {
            type: 'urn:ais-its:problem:validation-failed',
            status: 400,
            code: 'VALIDATION_FAILED',
            title: 'Validation failed',
            errors: [{ field: 'from', message: 'at most 31 days' }],
          },
          { status: 400 },
        ),
      ),
    );
    renderApp({ route: '/safety/collision' });
    expect(await screen.findByText('Filter tidak dapat diproses', {}, APP)).toBeInTheDocument();
    expect(screen.getByText(/maksimal 31 hari/)).toBeInTheDocument();
  });
});
