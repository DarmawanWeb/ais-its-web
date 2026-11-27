import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { FuelSeriesPointDto } from '@/shared/api/generated/telemetry/model';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

import { VESSEL_DETAIL, VESSEL_SUMMARY } from '../test/fixtures';
import { mockFleet } from '../test/handlers';

// MapLibre needs WebGL (not in jsdom): the live tab's mini map is replaced.
vi.mock('../components/vessel-mini-map', () => ({
  VesselMiniMap: () => <div data-testid="vessel-mini-map" />,
}));

/** The app shell and the lazy page can take a while on a busy machine. */
const APP = { timeout: 10_000 };

describe('vessel list', { timeout: 30_000 }, () => {
  it('lists the fleet with CII grades, last seen and the create action', async () => {
    const mock = mockFleet();
    renderApp({ route: '/vessels' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kapal' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Daftar kapal' });
    expect(await within(table).findByText('KM Bahari Nusantara')).toBeInTheDocument();
    expect(within(table).getByText('Lion City Spirit')).toBeInTheDocument();
    expect(await within(table).findByLabelText('Peringkat CII C')).toBeInTheDocument();
    // The other organization's vessel hides its technical data.
    expect(
      within(table).getAllByTitle('Data teknis hanya untuk organisasi pemilik').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Tambah kapal/ }).length).toBeGreaterThan(0);
    // Default scope: the active organization's fleet.
    await waitFor(() =>
      expect(mock.listParams.some((params) => params.get('orgId') === TEST_IDS.orgA)).toBe(true),
    );
  });

  it('hides the create action and the CII column without the permissions', async () => {
    mockFleet();
    renderApp({ route: '/vessels', session: { roles: ['authority'] } });
    const table = await screen.findByRole('table', { name: 'Daftar kapal' }, APP);
    expect(await within(table).findByText('KM Bahari Nusantara')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tambah kapal/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /CII/ })).not.toBeInTheDocument();
  });

  it('explains an empty fleet', async () => {
    mockFleet({ vessels: [] });
    renderApp({ route: '/vessels' });
    expect(await screen.findByText('Belum ada kapal di armada Anda', {}, APP)).toBeInTheDocument();
  });

  it('shows the problem of a failed list with a retry', async () => {
    mockFleet({ listError: true });
    renderApp({ route: '/vessels' });
    const alert = await screen.findByRole('alert', {}, APP);
    expect(within(alert).getByText('Server mengalami gangguan')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Coba lagi/ })).toBeInTheDocument();
  });
});

describe('vessel detail', { timeout: 30_000 }, () => {
  it('shows identity, engines and formula with the owner actions', async () => {
    mockFleet();
    renderApp({ route: `/vessels/${VESSEL_DETAIL.mmsi}` });
    expect(
      await screen.findByRole('heading', { level: 1, name: VESSEL_DETAIL.name }, APP),
    ).toBeInTheDocument();
    expect(screen.getByText('Armada Anda')).toBeInTheDocument();
    expect(screen.getByText('NIIGATA 6M28BET')).toBeInTheDocument();
    expect(screen.getByText('MAN D2866LE')).toBeInTheDocument();
    expect(screen.getByText(FORMULA_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ubah/ })).toHaveAttribute(
      'href',
      `/vessels/${VESSEL_DETAIL.mmsi}/edit`,
    );
    expect(screen.getByRole('button', { name: /Hapus/ })).toBeInTheDocument();
    for (const tab of ['Ringkasan', 'Live', 'CII', 'Telemetri', 'Alert']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }
  });

  it('opens the CII and alerts tabs', async () => {
    mockFleet();
    const user = userEvent.setup();
    renderApp({ route: `/vessels/${VESSEL_DETAIL.mmsi}` });
    await user.click(await screen.findByRole('tab', { name: 'CII' }, APP));
    expect(await screen.findByText('CII tahun 2026')).toBeInTheDocument();
    expect(screen.getByText('Telemetri 46% · Formula 49% · Holtrop 5%')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Alert' }));
    expect(await screen.findByText('Bahaya EWS: KM Bahari Nusantara')).toBeInTheDocument();
  });

  it('lists the latest raw readings in the telemetry tab', async () => {
    mockFleet();
    const reading = (minutesAgo: number, me: number): FuelSeriesPointDto => {
      const time = Date.now() - minutesAgo * 60_000;
      return {
        time: new Date(time).toISOString(),
        periodStart: new Date(time - 600_000).toISOString(),
        fuelMeTon: me,
        fuelAeTon: 0.004,
        totalFuelTon: me + 0.004,
        readings: 1,
        source: 'manual',
        deviceId: null,
      };
    };
    server.use(
      http.get('*/api/v2/telemetry/vessels/:mmsi/readings', ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('bucket') !== 'raw')
          return HttpResponse.json({ data: [], page: { nextCursor: null, limit: 60 } });
        // The tab asks for one newest-first page (order=desc).
        expect(params.get('order')).toBe('desc');
        return HttpResponse.json({
          data: [reading(4, 0.033), reading(14, 0.032), reading(24, 0.031)],
          page: { nextCursor: null, limit: Number(params.get('limit')) },
        });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/vessels/${VESSEL_DETAIL.mmsi}` });
    await user.click(await screen.findByRole('tab', { name: 'Telemetri' }, APP));
    const table = await screen.findByRole('table', { name: 'Pembacaan terbaru' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    // Newest first.
    expect(within(rows[1]!).getByText('0,033')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('0,031')).toBeInTheDocument();
    expect(within(table).getAllByText('Manual')).toHaveLength(3);
  });

  it('limits a viewer to reading and hides telemetry', async () => {
    mockFleet();
    renderApp({ route: `/vessels/${VESSEL_DETAIL.mmsi}`, session: { roles: ['viewer'] } });
    expect(
      await screen.findByRole('heading', { level: 1, name: VESSEL_DETAIL.name }, APP),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ubah/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hapus/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Telemetri' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'CII' })).toBeInTheDocument();
  });

  it('shows only the identity of another organization’s vessel', async () => {
    mockFleet();
    renderApp({ route: `/vessels/${VESSEL_SUMMARY.mmsi}` });
    expect(
      await screen.findByRole('heading', { level: 1, name: VESSEL_SUMMARY.name }, APP),
    ).toBeInTheDocument();
    expect(screen.getByText('Data teknis bersifat privat')).toBeInTheDocument();
    expect(screen.getByText('Organisasi lain')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'CII' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ubah/ })).not.toBeInTheDocument();
  });

  it('explains an unknown vessel', async () => {
    mockFleet();
    renderApp({ route: '/vessels/525999999' });
    expect(await screen.findByText('Kapal tidak ditemukan', {}, APP)).toBeInTheDocument();
  });
});

const FORMULA_TEXT = '-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197';

describe('vessel form', { timeout: 40_000 }, () => {
  it('validates the required fields before anything is sent', async () => {
    const mock = mockFleet();
    const user = userEvent.setup();
    renderApp({ route: '/vessels/new' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tambah Kapal' }, APP),
    ).toBeInTheDocument();
    await user.click(await screen.findByTestId('vessel-save'));
    expect((await screen.findAllByText('Wajib diisi')).length).toBeGreaterThan(5);
    expect(screen.getAllByText('Pilih salah satu').length).toBeGreaterThanOrEqual(2);
    expect(mock.created).toHaveLength(0);
  });

  it('patches only the changed fields of an edit and maps conflicts onto the field', async () => {
    const mock = mockFleet({
      patchProblem: { status: 409, code: 'MMSI_ALREADY_EXISTS', title: 'MMSI already exists' },
    });
    const user = userEvent.setup();
    renderApp({ route: `/vessels/${VESSEL_DETAIL.mmsi}/edit` });
    const mmsi = await screen.findByRole('spinbutton', { name: 'MMSI' }, APP);
    await user.clear(mmsi);
    await user.type(mmsi, '525019001');
    await user.click(screen.getByTestId('vessel-save'));
    await waitFor(() => expect(mock.patched).toEqual([{ mmsi: 525019001 }]));
    expect((await screen.findAllByText('MMSI sudah terdaftar')).length).toBeGreaterThan(0);
  });

  it('refuses to edit another organization’s vessel', async () => {
    mockFleet();
    renderApp({ route: `/vessels/${VESSEL_SUMMARY.mmsi}/edit` });
    expect(await screen.findByText('Kapal ini milik organisasi lain', {}, APP)).toBeInTheDocument();
  });

  it('is forbidden without vessel:write', async () => {
    mockFleet();
    renderApp({ route: '/vessels/new', session: { roles: ['viewer'] } });
    expect((await screen.findAllByText('Akses ditolak', {}, APP)).length).toBeGreaterThan(0);
  });

  it('checks a new formula with the safe grammar (reference:write)', async () => {
    mockFleet();
    const user = userEvent.setup();
    renderApp({ route: '/vessels/new', session: { roles: ['super_admin'] } });
    await user.click(await screen.findByRole('button', { name: /Formula baru/ }, APP));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Mesin utama (ME)'), 'speed * 2');
    await user.tab();
    expect(
      await within(dialog).findByText(/Nama tidak dikenal "speed" pada posisi 1/),
    ).toBeInTheDocument();
  });
});
