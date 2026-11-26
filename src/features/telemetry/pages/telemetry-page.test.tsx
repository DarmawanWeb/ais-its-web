import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  FuelReadingInputDto,
  TelemetryVesselDto,
} from '@/shared/api/generated/telemetry/model';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';

import { DEVICE, POINTS, STATUS, SUMMARY, VESSELS } from '../test/fixtures';

const APP = { timeout: 10_000 };

function mockTelemetry(
  options: {
    vessels?: TelemetryVesselDto[];
    vesselsError?: boolean;
    ingestConflict?: boolean;
  } = {},
) {
  const posted: FuelReadingInputDto[] = [];
  const vessels = options.vessels ?? VESSELS;
  server.use(
    http.get('*/api/v2/telemetry/vessels', () =>
      options.vesselsError
        ? HttpResponse.json(
            {
              type: 'urn:ais-its:problem:service-unavailable',
              status: 503,
              code: 'SERVICE_UNAVAILABLE',
              title: 'Unavailable',
            },
            { status: 503 },
          )
        : HttpResponse.json({
            data: vessels,
            meta: { page: 1, pageSize: 100, total: vessels.length },
          }),
    ),
    http.get('*/api/v2/telemetry/vessels/:mmsi/status', () => HttpResponse.json(STATUS)),
    http.get('*/api/v2/telemetry/vessels/:mmsi/summary', () => HttpResponse.json(SUMMARY)),
    http.get('*/api/v2/telemetry/vessels/:mmsi/readings', () =>
      HttpResponse.json({ data: POINTS, page: { nextCursor: null, limit: 500 } }),
    ),
    http.get('*/api/v2/telemetry/devices', () =>
      HttpResponse.json({ data: [DEVICE], meta: { page: 1, pageSize: 20, total: 1 } }),
    ),
    http.post('*/api/v2/telemetry/readings', async ({ request }) => {
      posted.push((await request.json()) as FuelReadingInputDto);
      if (options.ingestConflict) {
        return HttpResponse.json(
          {
            type: 'urn:ais-its:problem:reading-conflict',
            status: 409,
            code: 'READING_CONFLICT',
            title: 'Reading conflict',
            errors: [{ field: '0.time', message: 'a different reading exists' }],
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }
      return HttpResponse.json(
        { received: 1, accepted: 1, duplicates: 0, published: 1 },
        { status: 202 },
      );
    }),
  );
  return { posted };
}

describe('TelemetryPage', { timeout: 40_000 }, () => {
  it('explores the readings of the first vessel with totals, chart data and MQTT help', async () => {
    mockTelemetry();
    renderApp({ route: '/telemetry' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Telemetri Bahan Bakar' }, APP),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'KM Bahari Nusantara' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('27,73')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Data pembacaan' });
    expect(within(table).getAllByRole('row')).toHaveLength(POINTS.length + 1);
    expect(screen.getByRole('button', { name: /Input manual/ })).toBeInTheDocument();
    expect(screen.getByText('aisits/telemetry/<deviceId>')).toBeInTheDocument();
    // Fleet managers do not manage devices.
    expect(screen.getByText(/Pendaftaran dan pengaturan perangkat/)).toBeInTheDocument();
  });

  it('lists the devices of the vessel for organization admins', async () => {
    mockTelemetry();
    renderApp({ route: '/telemetry?mmsi=525005223', session: { roles: ['org_admin'] } });
    expect(await screen.findByText(DEVICE.name, {}, APP)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kelola perangkat/ })).toHaveAttribute(
      'href',
      '/admin/devices',
    );
  });

  it('explains an organization without vessels', async () => {
    mockTelemetry({ vessels: [] });
    renderApp({ route: '/telemetry' });
    expect(
      (await screen.findAllByText('Belum ada kapal di armada', {}, APP)).length,
    ).toBeGreaterThan(0);
  });

  it('shows the problem of a failed overview', async () => {
    mockTelemetry({ vesselsError: true });
    renderApp({ route: '/telemetry' });
    expect(await screen.findByText('Server mengalami gangguan', {}, APP)).toBeInTheDocument();
  });

  it('is forbidden without telemetry:read', async () => {
    mockTelemetry();
    renderApp({ route: '/telemetry', session: { roles: ['viewer'] } });
    expect((await screen.findAllByText('Akses ditolak', {}, APP)).length).toBeGreaterThan(0);
  });

  it('validates a manual reading and maps READING_CONFLICT onto the time', async () => {
    const { posted } = mockTelemetry({ ingestConflict: true });
    const user = userEvent.setup();
    renderApp({ route: '/telemetry' });
    await user.click(await screen.findByRole('button', { name: /Input manual/ }, APP));
    const dialog = await screen.findByRole('dialog');
    const me = within(dialog).getByLabelText('Bahan bakar mesin utama');
    await user.type(me, '-1');
    await user.type(within(dialog).getByLabelText('Bahan bakar mesin bantu'), '0.05');
    await user.click(within(dialog).getByTestId('reading-save'));
    expect(await within(dialog).findByText('Tidak boleh negatif')).toBeInTheDocument();
    expect(posted).toHaveLength(0);
    await user.clear(me);
    await user.type(me, '0.4');
    await user.click(within(dialog).getByTestId('reading-save'));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ mmsi: 525005223, fuelMeTon: 0.4, fuelAeTon: 0.05 });
    expect(
      await within(dialog).findByText(/Sudah ada pembacaan berbeda pada waktu ini/),
    ).toBeInTheDocument();
  });
});
