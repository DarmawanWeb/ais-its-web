import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderApp } from '@/test/render';

import { FLEET, MMSI, mockSeemp, problemResponse, SCENARIO, YEAR } from './seemp.fixtures';

const APP = { timeout: 10_000 };

describe('SeempPage', () => {
  it('shows the planning KPIs and the vessels with their priority', async () => {
    mockSeemp();
    renderApp({ route: '/seemp', session: { roles: ['fleet_manager'] } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'SEEMP' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Kapal untuk SEEMP' }, APP);
    expect(within(table).getByRole('row', { name: /MT Selat Jaya/ })).toHaveTextContent(
      'Rencana korektif',
    );
    expect(within(table).getByRole('row', { name: /KM Bahari Nusantara/ })).toHaveTextContent(
      'Pantau',
    );
    // One vessel is rated D: it needs a corrective plan.
    expect(screen.getByText(`Kapal berperingkat D atau E pada ${YEAR}`)).toBeInTheDocument();
  });

  it('lists the 12-measure catalog and the saved scenarios', async () => {
    mockSeemp();
    const user = userEvent.setup();
    renderApp({ route: '/seemp', session: { roles: ['viewer'] } });
    await user.click(await screen.findByRole('tab', { name: 'Katalog langkah' }, APP));
    expect(await screen.findByText('Katalog 12 langkah SEEMP', undefined, APP)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Skenario tersimpan' }));
    const scenarios = await screen.findByRole('table', { name: 'Skenario SEEMP tersimpan' }, APP);
    expect(within(scenarios).getByText(SCENARIO.name)).toBeInTheDocument();
    // Viewers cannot delete scenarios (seemp:simulate).
    expect(
      screen.queryByRole('button', { name: `Hapus skenario ${SCENARIO.name}` }),
    ).not.toBeInTheDocument();
  });

  it('explains an empty fleet and a failed fleet request', async () => {
    mockSeemp({
      fleet: () =>
        Response.json({ ...FLEET, vessels: 0, items: [], meta: { ...FLEET.meta, total: 0 } }),
    });
    const view = renderApp({ route: '/seemp', session: { roles: ['fleet_manager'] } });
    expect(
      await screen.findByText('Belum ada kapal di armada ini', undefined, APP),
    ).toBeInTheDocument();
    view.unmount();

    mockSeemp({ fleet: () => problemResponse(500, 'INTERNAL_ERROR') });
    renderApp({ route: '/seemp', session: { roles: ['fleet_manager'] } });
    expect(
      (await screen.findAllByRole('button', { name: 'Coba lagi' }, APP)).length,
    ).toBeGreaterThan(0);
  });
  it('is forbidden without seemp:read (authority role)', async () => {
    mockSeemp();
    renderApp({ route: `/seemp/vessels/${MMSI}`, session: { roles: ['authority'] } });
    expect(await screen.findByText('Akses ditolak', undefined, APP)).toBeInTheDocument();
  });
});

describe('SeempVesselPage', () => {
  it('ranks the recommendations and simulates a chosen measure', async () => {
    mockSeemp();
    const user = userEvent.setup();
    renderApp({ route: `/seemp/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'KM Bahari Nusantara' }, APP),
    ).toBeInTheDocument();
    expect(await screen.findByText(`CII dasar (${YEAR - 1})`, undefined, APP)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Rekomendasi langkah' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    await user.click(within(items[1]!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Simulasikan 1 langkah' }));
    expect(await screen.findByText('Hasil simulasi', undefined, APP)).toBeInTheDocument();
    expect(screen.getAllByText('6,4%').length).toBeGreaterThan(0);
  });

  it('is read-only for viewers: no simulation, no scenario deletion', async () => {
    mockSeemp();
    renderApp({ route: `/seemp/vessels/${MMSI}`, session: { roles: ['viewer'] } });
    expect(
      await screen.findByText('Simulasi tidak tersedia untuk peran Anda', undefined, APP),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Rekomendasi langkah' });
    expect(within(list).queryByRole('checkbox')).not.toBeInTheDocument();
    await screen.findByText(SCENARIO.name, undefined, APP);
    expect(
      screen.queryByRole('button', { name: `Hapus skenario ${SCENARIO.name}` }),
    ).not.toBeInTheDocument();
  });

  it('deletes a scenario after confirmation', async () => {
    const mock = mockSeemp();
    const user = userEvent.setup();
    renderApp({ route: `/seemp/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });
    await user.click(
      await screen.findByRole('button', { name: `Hapus skenario ${SCENARIO.name}` }, APP),
    );
    const dialog = await screen.findByRole('alertdialog', undefined, APP);
    await user.click(within(dialog).getByRole('button', { name: 'Hapus' }));
    expect(
      await screen.findByText(`Skenario "${SCENARIO.name}" dihapus`, undefined, APP),
    ).toBeInTheDocument();
    expect(mock.deleted).toEqual([SCENARIO.id]);
  });

  it('explains a vessel without a baseline CII', async () => {
    mockSeemp({ recommendations: () => problemResponse(404, 'CII_NOT_AVAILABLE') });
    renderApp({ route: `/seemp/vessels/${MMSI}`, session: { roles: ['fleet_manager'] } });
    expect(
      await screen.findByText('Belum ada CII dasar untuk kapal ini', undefined, APP),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buka CII kapal/ })).toBeInTheDocument();
  });
});
