import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';

import { EMPTY_FLEET, type FACTORS, MMSI, mockCii, problemResponse, YEAR } from './cii.fixtures';

const APP = { timeout: 10_000 };

describe('CiiPage (fleet summary)', () => {
  it('shows KPIs, the grade distribution and the fleet table', async () => {
    mockCii();
    renderApp({ route: '/cii', session: { roles: ['fleet_manager'] } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Emisi & CII' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: `CII kapal armada tahun ${YEAR}` }, APP);
    const row = within(table).getByRole('row', { name: /KM Bahari Nusantara/ });
    expect(row).toHaveTextContent('Sedang');
    expect(row).toHaveTextContent('0,950');
    expect(within(table).getByRole('row', { name: /TB Pelita 5/ })).toHaveTextContent('—');
    // 3 vessels, 2 rated; the reduction factor of the year with its source.
    expect(screen.getByText('dari 3')).toBeInTheDocument();
    expect(await screen.findByText('11%', undefined, APP)).toBeInTheDocument();
    expect(screen.getByText(`Distribusi peringkat ${YEAR}`)).toBeInTheDocument();
    // Weather-derived figures (Holtrop) carry the Open-Meteo attribution.
    expect(screen.getByRole('link', { name: 'Data cuaca oleh Open-Meteo.com' })).toBeVisible();
    // A fleet manager sees only the active organization: no organization filter.
    expect(screen.queryByLabelText('Organisasi')).not.toBeInTheDocument();
  });

  it('offers the organization filter to platform administrators', async () => {
    mockCii();
    renderApp({ route: '/cii', session: { roles: ['super_admin'] } });
    expect(await screen.findByLabelText('Organisasi', undefined, APP)).toBeInTheDocument();
  });

  it('explains an empty fleet', async () => {
    mockCii({ fleet: () => Response.json(EMPTY_FLEET) });
    renderApp({ route: '/cii', session: { roles: ['viewer'] } });
    expect(
      await screen.findByText('Belum ada kapal di armada ini', undefined, APP),
    ).toBeInTheDocument();
  });

  it('shows an error state with retry when the summary fails', async () => {
    mockCii({ fleet: () => problemResponse(503, 'SERVICE_UNAVAILABLE', 'Unavailable') });
    renderApp({ route: '/cii', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByRole('button', { name: 'Coba lagi' }, APP)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('is forbidden without cii:read (authority role)', async () => {
    mockCii();
    renderApp({ route: '/cii', session: { roles: ['authority'] } });
    expect(await screen.findByText('Akses ditolak', undefined, APP)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Emisi & CII' })).toBeNull();
  });
});

describe('CiiVesselPage', () => {
  it('shows the year-to-date figures with their methods, scale and projection', async () => {
    mockCii();
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'KM Bahari Nusantara' }, APP),
    ).toBeInTheDocument();
    expect(await screen.findByText('6,44', undefined, APP)).toBeInTheDocument();
    expect(screen.getByText('6,77')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Skala peringkat CII/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proyeksi akhir tahun' })).toBeInTheDocument();
    // Every computed figure has its "ⓘ source" popover.
    expect(screen.getAllByRole('button', { name: /^Sumber metode:/ }).length).toBeGreaterThan(5);
    expect(screen.getAllByRole('link', { name: 'Data cuaca oleh Open-Meteo.com' }).length).toBe(1);
    // Fleet manager: SEEMP link, no platform-admin recomputation.
    expect(screen.getByRole('link', { name: /Rekomendasi SEEMP/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hitung ulang' })).not.toBeInTheDocument();
  });

  it('offers the recomputation to platform administrators', async () => {
    mockCii();
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['super_admin'] } });
    expect(await screen.findByRole('button', { name: 'Hitung ulang' }, APP)).toBeInTheDocument();
  });

  it('explains CII_NOT_AVAILABLE and offers a manual record with vessel:write', async () => {
    mockCii({
      current: () => problemResponse(404, 'CII_NOT_AVAILABLE'),
    });
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });
    expect(
      await screen.findByText(`Belum ada data CII untuk ${YEAR}`, undefined, APP),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Isi catatan manual ${YEAR}` })).toBeInTheDocument();
  });

  it('hides the manual record action from viewers', async () => {
    mockCii({ current: () => problemResponse(404, 'CII_NOT_AVAILABLE') });
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['viewer'] } });
    expect(
      await screen.findByText(`Belum ada data CII untuk ${YEAR}`, undefined, APP),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Isi catatan manual ${YEAR}` }),
    ).not.toBeInTheDocument();
  });

  it('explains a vessel of another organization', async () => {
    mockCii({ current: () => problemResponse(403, 'FORBIDDEN') });
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });
    expect(
      await screen.findByText('Data kapal ini milik organisasi lain', undefined, APP),
    ).toBeInTheDocument();
  });

  it('flags manual years in the annual history', async () => {
    mockCii();
    const user = userEvent.setup();
    renderApp({ route: `/cii/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });
    await user.click(await screen.findByRole('tab', { name: 'Riwayat tahunan' }, APP));
    const history = await screen.findByRole('table', { name: 'Riwayat CII tahunan' }, APP);
    expect(
      within(history).getByRole('row', { name: new RegExp(String(YEAR - 1)) }),
    ).toHaveTextContent('Manual');
  });

  it('rejects an invalid MMSI', async () => {
    mockCii();
    renderApp({ route: '/cii/vessels/12345', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('MMSI tidak valid', undefined, APP)).toBeInTheDocument();
  });
});

describe('ReductionFactorsPage', () => {
  it('lists the factors per year read-only without reference:write', async () => {
    mockCii();
    renderApp({ route: '/cii/reduction-factors', session: { roles: ['fleet_manager'] } });
    const table = await screen.findByRole('table', { name: 'Faktor reduksi per tahun' }, APP);
    expect(
      within(table).getByRole('row', { name: new RegExp(String(YEAR + 1)) }),
    ).toHaveTextContent('13,625%');
    expect(screen.queryByRole('button', { name: 'Ubah faktor' })).not.toBeInTheDocument();
  });

  it('lets platform administrators edit the factors', async () => {
    mockCii();
    renderApp({ route: '/cii/reduction-factors', session: { roles: ['super_admin'] } });
    expect(
      (await screen.findAllByRole('button', { name: 'Ubah faktor' }, APP)).length,
    ).toBeGreaterThan(0);
  });

  it('explains an empty table and a failed request', async () => {
    mockCii({ factors: () => Response.json({ data: [] } satisfies typeof FACTORS) });
    const view = renderApp({
      route: '/cii/reduction-factors',
      session: { roles: ['fleet_manager'] },
    });
    expect(await screen.findByText('Belum ada faktor reduksi', undefined, APP)).toBeInTheDocument();
    view.unmount();

    mockCii({ factors: () => problemResponse(500, 'INTERNAL_ERROR') });
    renderApp({ route: '/cii/reduction-factors', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByRole('button', { name: 'Coba lagi' }, APP)).toBeInTheDocument();
  });
});
