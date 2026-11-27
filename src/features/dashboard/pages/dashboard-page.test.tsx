import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { AisStatsDto } from '@/shared/api/generated/ais-processor/model';
import type { TrafficSeriesDto } from '@/shared/api/generated/ais-processor/model';
import type { FleetFuelDto, FleetSummaryDto } from '@/shared/api/generated/emission/model';
import type {
  AlertDto,
  AlertSeriesDto,
  AlertSummaryDto,
} from '@/shared/api/generated/notification/model';
import type { SafetyStatsDto, SafetyVesselStateDto } from '@/shared/api/generated/safety/model';
import type { SurveillanceStatsDto } from '@/shared/api/generated/surveillance/model';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

// MapLibre needs WebGL (not in jsdom).
vi.mock('../components/fleet-map', () => ({ FleetMap: () => <div data-testid="dashboard-map" /> }));

const APP = { timeout: 10_000 };

const STATS: AisStatsDto = {
  activeVessels: 14,
  messagesLastMinute: 128,
  bySource: {
    primary: { activeVessels: 9, messagesLastMinute: 84 },
    batam: { activeVessels: 5, messagesLastMinute: 44 },
    pusher: { activeVessels: 0, messagesLastMinute: 0 },
  },
  activeWindowMinutes: 30,
  at: new Date().toISOString(),
};

const SUMMARY: AlertSummaryDto = {
  total: 3,
  bySeverity: { info: 0, warning: 2, critical: 1 },
  byDomain: { safety: 2, surveillance: 1 },
  byType: { ews: 1, collision: 1, dark: 1 },
};

const ALERT = {
  id: '0192f0c8-7d3a-7c2e-9a1f-000000000001',
  type: 'ews',
  domain: 'safety',
  severity: 'critical',
  status: 'open',
  mmsi: 525005223,
  relatedMmsi: null,
  orgId: TEST_IDS.orgA,
  title: 'Bahaya EWS: KM Bahari Nusantara',
  message: 'Kapal diprediksi berlabuh dekat pipa',
  lat: 1.15,
  lon: 103.9,
  zoneId: null,
  methodId: 'ews.pipeline_distance_status',
  dedupKey: 'ews:525005223:z1',
  messageKey: null,
  messageParams: {},
  resolutionReason: null,
  resolutionMessageKey: null,
  resolutionMessageParams: {},
  resolutionEventId: null,
  data: {},
  source: 'safety',
  occurrences: 1,
  occurredAt: new Date().toISOString(),
  lastOccurredAt: new Date().toISOString(),
  acknowledgedBy: null,
  acknowledgedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  updatedAt: new Date().toISOString(),
} satisfies AlertDto;

const EWS = [
  { mmsi: 525005223, ewsStatus: 0, vessel: { id: 'v1', name: 'KM Bahari Nusantara' } },
  { mmsi: 525019002, ewsStatus: 1, vessel: { id: 'v2', name: 'MT Selat Jaya' } },
] as unknown as SafetyVesselStateDto[];

const SURVEILLANCE = {
  from: new Date(Date.now() - 86_400_000).toISOString(),
  to: new Date().toISOString(),
  total: 5,
  active: 2,
  byType: { transhipment: 1, dark: 3, anomaly: 1 },
  bySeverity: {},
  byStatus: {},
  transhipmentQueue: null,
  fishingViolations: 0,
} as unknown as SurveillanceStatsDto;

const FLEET: FleetSummaryDto = {
  year: 2026,
  orgId: TEST_IDS.orgA,
  vessels: 4,
  grades: { A: 1, B: 1, C: 1, D: 0, E: 0 },
  notAvailable: 1,
  items: [
    {
      mmsi: 525005223,
      vesselId: 'v1',
      name: 'KM Bahari Nusantara',
      grade: 'C',
      rating: 0.93,
      attained: 14.8,
      source: 'segments',
      imo: null,
      typeCode: 'bulk_carrier',
      required: null,
      zPercent: null,
      previousYear: null,
    },
  ],
  meta: { page: 1, pageSize: 100, total: 1 },
  methodIds: ['cii.rating_grade'],
};

const TRAFFIC = {
  from: '2026-11-22T04:00:00.000Z',
  to: '2026-11-22T10:00:00.000Z',
  bucket: '5m',
  bucketMinutes: 5,
  activeWindowMinutes: 30,
  points: [0, 1, 2].map((index) => ({
    at: new Date(Date.parse('2026-11-22T09:45:00Z') + index * 300_000).toISOString(),
    samples: 5,
    messages: 640,
    activeVessels: 14,
    bySource: {
      primary: { messages: 420, activeVessels: 9 },
      batam: { messages: 220, activeVessels: 5 },
      pusher: { messages: 0, activeVessels: 0 },
    },
  })),
} satisfies TrafficSeriesDto;

const ALERT_SERIES = {
  from: '2026-11-15T17:00:00.000Z',
  to: '2026-11-22T10:00:00.000Z',
  bucket: '1d',
  groupBy: 'severity',
  timeZone: 'Asia/Jakarta',
  keys: ['info', 'warning', 'critical'],
  buckets: [
    {
      from: '2026-11-21T17:00:00.000Z',
      to: '2026-11-22T17:00:00.000Z',
      total: 1,
      counts: { info: 0, warning: 0, critical: 1 },
    },
  ],
} satisfies AlertSeriesDto;

const SAFETY_STATS = {
  ews: { danger: 1, warning: 1, methodId: 'ews.pipeline_distance_status' },
  collision: { high: 0, medium: 1, methodId: 'collision.cpa_tcpa' },
  since: '2026-11-21T10:00:00.000Z',
  at: '2026-11-22T10:00:00.000Z',
} satisfies SafetyStatsDto;

const period = (from: string, to: string) => ({
  from,
  to,
  fuelMeTon: 3,
  fuelAeTon: 0.5,
  totalFuelTon: 3.5,
  co2Ton: 11,
  vesselsWithData: 1,
  manualVessels: 0,
  methods: { telemetry: 10, firstFormula: 0, holtrop: 0 },
});

const FUEL = {
  orgId: TEST_IDS.orgA,
  vessels: 4,
  year: period('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'),
  month: period('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'),
  methodIds: ['fuel.method_selection'],
} satisfies FleetFuelDto;

function mockDashboard(options: { statsError?: boolean } = {}) {
  server.use(
    http.get('*/api/v2/ais/stats', () =>
      options.statsError
        ? HttpResponse.json(
            {
              type: 'urn:ais-its:problem:internal-error',
              status: 500,
              code: 'INTERNAL_ERROR',
              title: 'Internal error',
            },
            { status: 500 },
          )
        : HttpResponse.json(STATS),
    ),
    http.get('*/api/v2/alerts/summary', () => HttpResponse.json(SUMMARY)),
    http.get('*/api/v2/alerts', () =>
      HttpResponse.json({ data: [ALERT], page: { nextCursor: null, limit: 500 } }),
    ),
    http.get('*/api/v2/ais/stats/series', () => HttpResponse.json(TRAFFIC)),
    http.get('*/api/v2/alerts/stats/series', () => HttpResponse.json(ALERT_SERIES)),
    http.get('*/api/v2/safety/stats', () => HttpResponse.json(SAFETY_STATS)),
    http.get('*/api/v2/safety/vessels', ({ request }) => {
      const status = new URL(request.url).searchParams.get('ewsStatus')?.split(',').map(Number);
      return HttpResponse.json(EWS.filter((state) => !status || status.includes(state.ewsStatus)));
    }),
    http.get('*/api/v2/surveillance/stats', () => HttpResponse.json(SURVEILLANCE)),
    http.get('*/api/v2/cii/fleet/summary', () => HttpResponse.json(FLEET)),
    http.get('*/api/v2/cii/fleet/fuel', () => HttpResponse.json(FUEL)),
  );
}

describe('DashboardPage', { timeout: 30_000 }, () => {
  it('shows every card of a fleet manager with live KPIs', async () => {
    mockDashboard();
    renderApp({ route: '/dashboard' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dashboard Armada' }, APP),
    ).toBeInTheDocument();
    expect(await screen.findByText('Posisi AIS dalam 30 menit terakhir')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(await screen.findByText('1 kritis')).toBeInTheDocument();
    expect(await screen.findByText('1 kapal waspada')).toBeInTheDocument();
    expect(await screen.findByText('Bahaya EWS: KM Bahari Nusantara')).toBeInTheDocument();
    const surveillance = (
      await screen.findByRole('heading', { name: 'Pengawasan 24 jam' })
    ).closest('section') as HTMLElement;
    expect(within(surveillance).getByText('5')).toBeInTheDocument();
    expect(await screen.findByText(/3 dari 4 kapal memiliki peringkat/)).toBeInTheDocument();
    expect(await screen.findAllByText('3,5')).toHaveLength(2);
    expect(screen.getByText(/Data cuaca oleh Open-Meteo/i)).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-map')).toBeInTheDocument();
  });

  it('hides the cards an authority cannot read (CII and fuel)', async () => {
    mockDashboard();
    renderApp({ route: '/dashboard', session: { roles: ['authority'] } });
    expect(
      await screen.findByText('Posisi AIS dalam 30 menit terakhir', {}, APP),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /CII armada/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pengawasan 24 jam' })).toBeInTheDocument();
  });

  it('explains an empty fleet and an empty alert list', async () => {
    mockDashboard();
    server.use(
      http.get('*/api/v2/alerts', () =>
        HttpResponse.json({ data: [], page: { nextCursor: null, limit: 6 } }),
      ),
      http.get('*/api/v2/cii/fleet/summary', () =>
        HttpResponse.json({
          ...FLEET,
          vessels: 0,
          grades: { A: 0, B: 0, C: 0, D: 0, E: 0 },
          notAvailable: 0,
          items: [],
          meta: { page: 1, pageSize: 100, total: 0 },
        } satisfies FleetSummaryDto),
      ),
    );
    renderApp({ route: '/dashboard' });
    expect(await screen.findByText('Belum ada kapal dengan data CII', {}, APP)).toBeInTheDocument();
    expect(await screen.findByText('Belum ada alert')).toBeInTheDocument();
    expect(screen.queryByText('Bahan bakar bulan ini')).not.toBeInTheDocument();
  });

  it('shows the problem of a failed card without hiding the others', async () => {
    mockDashboard({ statsError: true });
    renderApp({ route: '/dashboard' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dashboard Armada' }, APP),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Server mengalami gangguan')).length).toBeGreaterThan(0);
    expect(await screen.findByText('1 kritis')).toBeInTheDocument();
  });
});
