import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadCsv } from '@/shared/lib/csv';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';

import type { SurveillanceEvent, TranshipmentResult } from '../lib/dto';
import {
  cursorPage,
  DETECTORS,
  HEATMAP,
  makeEvent,
  makeResult,
  makeStats,
  makeTranshipmentEvent,
  makeViolation,
} from '../test/fixtures';

// Maps need WebGL: the page tests replace them (map layers are covered by Playwright).
vi.mock('../components/maps/map-preview', () => ({
  MapPreview: ({ ariaLabel }: { ariaLabel: string }) => (
    <div data-testid="map-preview" aria-label={ariaLabel} />
  ),
}));
vi.mock('../components/pair-replay', () => ({
  PairReplay: () => <div data-testid="pair-replay" />,
}));
vi.mock('@/shared/lib/csv', () => ({ downloadCsv: vi.fn() }));

const problem = (status: number, code: string) =>
  HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, title: code, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

interface Api {
  events?: SurveillanceEvent[] | 'error';
  results?: TranshipmentResult[];
  stats?: ReturnType<typeof makeStats> | 'error';
}

/** Registers the surveillance endpoints; returns the requests the page made. */
function useApi({ events = [], results = [], stats = makeStats() }: Api = {}) {
  const requests: URL[] = [];
  server.use(
    http.get('*/api/v2/surveillance/events', ({ request }) => {
      requests.push(new URL(request.url));
      return events === 'error'
        ? problem(500, 'INTERNAL_ERROR')
        : HttpResponse.json(cursorPage(events));
    }),
    http.get('*/api/v2/surveillance/events/:id', ({ params }) => {
      const event = events === 'error' ? undefined : events.find((item) => item.id === params.id);
      return event ? HttpResponse.json(event) : problem(404, 'SURVEILLANCE_EVENT_NOT_FOUND');
    }),
    http.get('*/api/v2/surveillance/transhipments', () => HttpResponse.json(cursorPage(results))),
    http.get('*/api/v2/surveillance/stats', () =>
      stats === 'error' ? problem(500, 'INTERNAL_ERROR') : HttpResponse.json(stats),
    ),
    http.get('*/api/v2/surveillance/detectors', () => HttpResponse.json(DETECTORS)),
    http.get('*/api/v2/surveillance/heatmap', () => HttpResponse.json(HEATMAP)),
    http.get('*/api/v2/surveillance/fishing-violations', ({ request }) => {
      const year = new URL(request.url).searchParams.get('year');
      const items = [
        makeViolation(),
        makeViolation({ vesselName: 'KM Hai Long 9', year: 2017 }),
      ].filter((item) => !year || item.year === Number(year));
      return HttpResponse.json({
        data: items,
        meta: { page: 1, pageSize: 20, total: items.length },
      });
    }),
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
        zoom: null,
        toleranceDeg: 0,
      }),
    ),
  );
  return requests;
}

beforeEach(() => vi.mocked(downloadCsv).mockClear());
afterEach(() => vi.useRealTimers());

describe('surveillance overview', () => {
  it('shows the counts, breakdowns, detectors and the candidate queue for authorities', async () => {
    useApi({ events: [makeEvent({ title: 'AIS gap of 525005223' })] });
    const { router } = renderApp({ route: '/surveillance', session: { roles: ['authority'] } });
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Ringkasan Pengawasan' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/surveillance');
    expect(await screen.findByText('Antrean kandidat transhipment')).toBeInTheDocument();
    expect(screen.getByText('Masih berlangsung')).toBeInTheDocument();
    // Titles are built in the UI language from the type and the vessel (the service's are English).
    expect(await screen.findByText('AIS KM Bahari Nusantara terputus')).toBeInTheDocument();
    // the geofence detector of the fixture is disabled
    expect(await screen.findByText('Nonaktif')).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /jumlah kejadian per jenis/i })).toBeInTheDocument();
  });

  it('switches the trend to a table view', async () => {
    useApi();
    renderApp({ route: '/surveillance' });
    await screen.findByRole('heading', { level: 1, name: 'Ringkasan Pengawasan' });
    await userEvent.click(await screen.findByRole('button', { name: 'Tabel' }));
    expect(screen.getByRole('table', { name: /jumlah kejadian per jenis/i })).toBeInTheDocument();
  });

  it('explains an empty period and hides the queue from organization users', async () => {
    useApi({ stats: makeStats({ total: 0, transhipmentQueue: null }) });
    renderApp({ route: '/surveillance', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('Belum ada kejadian')).toBeInTheDocument();
    expect(screen.queryByText('Antrean kandidat transhipment')).not.toBeInTheDocument();
  });

  it('exports the counts per period and type as CSV', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance', session: { roles: ['authority'] } });
    const button = await screen.findByRole('button', { name: 'Ekspor CSV' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const [fileName, rows] = vi.mocked(downloadCsv).mock.calls[0] ?? [];
    expect(fileName).toMatch(/^surveillance-trend-7d-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(rows?.length).toBeGreaterThan(0);
    expect(Object.keys(rows?.[0] ?? {})).toEqual(
      expect.arrayContaining(['periode_mulai', 'Transhipment ilegal', 'jumlah']),
    );
  });

  it('shows the problem when the statistics fail', async () => {
    useApi({ stats: 'error' });
    renderApp({ route: '/surveillance' });
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => /server/i.test(alert.textContent ?? ''))).toBe(true);
  });
});

describe('transhipment', () => {
  it('lists the events with their score and opens the replay page', async () => {
    const event = makeTranshipmentEvent();
    const requests = useApi({ events: [event] });
    const { router } = renderApp({ route: '/surveillance/transhipment' });
    const table = await screen.findByRole('table', { name: 'Kejadian transhipment' });
    expect(await within(table).findByText('MV Batam Express')).toBeInTheDocument();
    expect(within(table).getByText(/92,4/)).toBeInTheDocument();
    expect(requests[0]?.searchParams.get('type')).toBe('transhipment');
    await userEvent.click(within(table).getByText('Kritis'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/surveillance/transhipment/${event.id}`),
    );
  });

  it('shows the legacy analysis results', async () => {
    useApi({ results: [makeResult({ averagePriority: 14.25 })] });
    renderApp({ route: '/surveillance/transhipment?tab=results' });
    const table = await screen.findByRole('table', { name: 'Hasil analisis transhipment' });
    expect(await within(table).findByText('14,25')).toBeInTheDocument();
    expect(
      within(table).getByRole('img', { name: /Rendah 10 %, Sedang 35 %, Tinggi 55 %/ }),
    ).toBeInTheDocument();
  });

  it('explains what the detector looks for when nothing was found', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance/transhipment' });
    expect(await screen.findByText('Belum ada dugaan transhipment')).toBeInTheDocument();
    expect(screen.getAllByText(/600 m dalam 5 menit/).length).toBeGreaterThan(0);
  });

  it('exports the filtered events as CSV', async () => {
    useApi({ events: [makeTranshipmentEvent()] });
    renderApp({ route: '/surveillance/transhipment' });
    await screen.findByRole('table', { name: 'Kejadian transhipment' });
    await userEvent.click(screen.getByRole('button', { name: 'Ekspor CSV' }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const [fileName, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(fileName).toMatch(/^transhipment-events-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(rows[0]).toMatchObject({ MMSI: 525005223, akurasi_persen: 92.4 });
  });

  it('shows the problem with a retry when the events fail', async () => {
    useApi({ events: 'error' });
    renderApp({ route: '/surveillance/transhipment' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('transhipment detail and review', () => {
  function useDetail(event: SurveillanceEvent) {
    const bodies: unknown[] = [];
    useApi({ events: [event], results: [makeResult({ eventId: event.id })] });
    server.use(
      http.patch('*/api/v2/surveillance/events/:id', async ({ request }) => {
        const body = (await request.json()) as { status: string; note?: string | null };
        bodies.push(body);
        return HttpResponse.json({
          ...event,
          status: body.status,
          ...('note' in body ? { note: body.note } : {}),
          reviewedAt: '2026-11-22T10:00:00.000Z',
          reviewedBy: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a',
        });
      }),
    );
    return bodies;
  }

  it('confirms an event with a note (surveillance:review)', async () => {
    const event = makeTranshipmentEvent();
    const bodies = useDetail(event);
    renderApp({
      route: `/surveillance/transhipment/${event.id}`,
      session: { roles: ['authority'] },
    });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'KM Bahari Nusantara ↔ MV Batam Express',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pair-replay')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Konfirmasi/ }));
    await userEvent.type(screen.getByLabelText('Catatan peninjau'), 'Patroli KSOP 22/11');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan tinjauan' }));
    await waitFor(() =>
      expect(bodies).toEqual([{ status: 'confirmed', note: 'Patroli KSOP 22/11' }]),
    );
    expect(await screen.findByText('Tinjauan disimpan')).toBeInTheDocument();
  });

  it('keeps the stored note when it is not changed', async () => {
    const event = makeTranshipmentEvent({ note: 'Catatan lama' });
    const bodies = useDetail(event);
    renderApp({
      route: `/surveillance/transhipment/${event.id}`,
      session: { roles: ['super_admin'] },
    });
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(await screen.findByRole('radio', { name: /Abaikan/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan tinjauan' }));
    await waitFor(() => expect(bodies).toEqual([{ status: 'dismissed' }]));
  });

  it('hides the review form without surveillance:review', async () => {
    const event = makeTranshipmentEvent({
      note: 'Sudah diperiksa',
      status: 'confirmed',
      reviewedAt: '2026-11-21T10:00:00.000Z',
    });
    useDetail(event);
    renderApp({
      route: `/surveillance/transhipment/${event.id}`,
      session: { roles: ['fleet_manager'] },
    });
    expect(
      await screen.findByText('Hanya otoritas yang dapat meninjau kejadian.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan tinjauan' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Sudah diperiksa').length).toBeGreaterThan(0);
  });

  it('says when the event is not visible', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance/transhipment/0192f0c8-7d3a-7c2e-9a1b-999999999999' });
    expect(await screen.findByText('Kejadian transhipment tidak ditemukan')).toBeInTheDocument();
  });
});

describe('dark vessels', () => {
  it('shows the gap, the harbour rule with the active thresholds and the state', async () => {
    useApi({
      events: [
        makeEvent({
          data: {
            lastSeenAt: '2026-11-21T08:00:00.000Z',
            lastSogKn: 12.4,
            gapMin: 31,
            nearestHarbourM: 18_400,
          },
        }),
      ],
    });
    renderApp({ route: '/surveillance/dark' });
    expect(await screen.findByText('Senyap lebih dari 45 menit')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Kejadian kapal gelap' });
    expect(await within(table).findByText('Masih gelap')).toBeInTheDocument();
    expect(within(table).getByText('18,4')).toBeInTheDocument();
  });

  it('opens the event detail with the review hidden for viewers', async () => {
    useApi({ events: [makeEvent({ title: 'AIS gap of 525005223' })] });
    renderApp({ route: '/surveillance/dark', session: { roles: ['viewer'] } });
    const table = await screen.findByRole('table', { name: 'Kejadian kapal gelap' });
    await userEvent.click(await within(table).findByText('Masih gelap'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('AIS KM Bahari Nusantara terputus')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Simpan tinjauan' }),
    ).not.toBeInTheDocument();
  });

  it('shows the error with a retry', async () => {
    useApi({ events: 'error' });
    renderApp({ route: '/surveillance/dark' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });

  it('explains the gap and harbour rule when no vessel went dark', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance/dark' });
    expect(await screen.findByText('Belum ada kapal gelap')).toBeInTheDocument();
    // The empty state repeats what the detector looks for, with the active thresholds.
    const rules = await screen.findAllByText(/45 menit/);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('translates the resolution reason in the detail timeline', async () => {
    useApi({
      events: [
        makeEvent({
          resolvedAt: '2026-11-21T09:10:00.000Z',
          status: 'resolved',
          resolution: { reason: 'AIS reports resumed', gapMin: 70 },
          data: { lastSeenAt: '2026-11-21T08:00:00.000Z', lastSogKn: 9, gapMin: 31 },
        }),
      ],
    });
    renderApp({ route: '/surveillance/dark' });
    const table = await screen.findByRole('table', { name: 'Kejadian kapal gelap' });
    await userEvent.click(await within(table).findByText(/Muncul/));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Alasan: laporan AIS kembali diterima'),
    ).toBeInTheDocument();
  });
});

describe('navigational status anomalies', () => {
  it('compares the reported and predicted status with the streak', async () => {
    useApi({
      events: [
        makeEvent({
          type: 'anomaly',
          methodId: 'anomaly.navstatus_mismatch',
          data: { navstatus: 1, predictedNavstatus: 0, streak: 5, minPositions: 3, sogKn: 6.8 },
        }),
      ],
    });
    renderApp({ route: '/surveillance/anomaly' });
    const table = await screen.findByRole('table', { name: 'Kejadian anomali status navigasi' });
    expect(await within(table).findByText('5/3')).toBeInTheDocument();
    expect(within(table).getByText('Tidak berlabuh jangkar (prediksi)')).toBeInTheDocument();
  });

  it('explains the rule when there are no anomalies', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance/anomaly?severity=critical' });
    expect(
      await screen.findByText('Tidak ada kejadian yang cocok dengan filter'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atur ulang filter' })).toBeInTheDocument();
  });

  it('shows the problem with a retry when the events fail', async () => {
    useApi({ events: 'error' });
    renderApp({ route: '/surveillance/anomaly' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('illegal fishing', () => {
  it('lists loitering detections and the historical violations', async () => {
    useApi({
      events: [
        makeEvent({
          type: 'fishing',
          methodId: 'fishing.loitering',
          zoneName: 'Daerah penangkapan ikan Natuna Utara',
          data: {
            zoneKind: 'fishing_ground',
            durationMin: 75,
            meanSogKn: 2.1,
            courseChangeRateDegPerMin: 4.2,
          },
        }),
      ],
    });
    renderApp({ route: '/surveillance/fishing' });
    const table = await screen.findByRole('table', {
      name: 'Kejadian dugaan penangkapan ikan ilegal',
    });
    expect(
      await within(table).findByText('Daerah penangkapan ikan Natuna Utara'),
    ).toBeInTheDocument();
    expect(within(table).getByText('4,2 °/mnt')).toBeInTheDocument();
    expect(await screen.findByText(/Peta panas 6 kejadian/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Pelanggaran historis/ }));
    const history = await screen.findByRole('table', {
      name: 'Pelanggaran penangkapan ikan historis',
    });
    expect(await within(history).findByText('KM Hai Long 9')).toBeInTheDocument();
  });

  it('explains the loitering rule when nothing was detected', async () => {
    useApi({ events: [] });
    renderApp({ route: '/surveillance/fishing' });
    expect(await screen.findByText('Belum ada dugaan penangkapan ikan ilegal')).toBeInTheDocument();
  });

  it('shows the problem with a retry when the detections fail', async () => {
    useApi({ events: 'error' });
    renderApp({ route: '/surveillance/fishing' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});
