import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { CreateFuelFormulaDto } from '@/shared/api/generated/fleet/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';

import { APP, FORMULAS, FUELS, page, problem, VESSEL_TYPES } from './test-fixtures';

function mockReference() {
  const state = { formulas: [] as CreateFuelFormulaDto[] };
  server.use(
    http.get('*/api/v2/vessel-types', () => HttpResponse.json(page(VESSEL_TYPES))),
    http.get('*/api/v2/fuels', () => HttpResponse.json(page(FUELS))),
    http.get('*/api/v2/fuel-formulas', () => HttpResponse.json(page(FORMULAS))),
    http.post('*/api/v2/fuel-formulas', async ({ request }) => {
      const body = (await request.json()) as CreateFuelFormulaDto;
      state.formulas.push(body);
      return HttpResponse.json(
        {
          id: '0192f0c8-7d3a-7c2e-9a23-000000000099',
          code: null,
          source: null,
          ...body,
          createdAt: '2026-11-23T00:00:00.000Z',
          updatedAt: '2026-11-23T00:00:00.000Z',
        },
        { status: 201 },
      );
    }),
    http.delete('*/api/v2/fuels/:id', () =>
      problem(409, 'REFERENCE_IN_USE', 'Reference in use', { detail: 'used by vessels' }),
    ),
  );
  return state;
}

describe('reference data page', { timeout: 30_000 }, () => {
  it('shows vessel types with their CII parameters, read-only without reference:write', async () => {
    mockReference();
    renderApp({ route: '/admin/reference-data', session: { roles: ['fleet_manager'] } });
    const table = await screen.findByRole('table', { name: 'Tipe kapal' }, APP);
    expect(await within(table).findByText('Bulk carrier')).toBeInTheDocument();
    expect(within(table).getByText(/0,86 · 0,94 · 1,06 · 1,18/)).toBeInTheDocument();
    expect(screen.getByText('Baca saja')).toBeInTheDocument();
    // Forbidden actions are hidden, not disabled.
    expect(screen.queryByRole('button', { name: 'Tipe kapal baru' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aksi untuk Bulk carrier' }),
    ).not.toBeInTheDocument();
  });

  it('checks fuel formulas against the safe grammar while typing and saves valid ones', async () => {
    const state = mockReference();
    const user = userEvent.setup();
    renderApp({
      route: '/admin/reference-data?tab=formulas',
      session: { roles: ['super_admin'] },
    });
    await user.click(await screen.findByRole('button', { name: 'Rumus bahan bakar baru' }, APP));
    const dialog = await screen.findByRole('dialog', { name: 'Rumus bahan bakar baru' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama' }), 'KM Kepri Indah');
    const main = within(dialog).getByRole('textbox', { name: 'Rumus mesin induk' });
    await user.type(main, 'process.exit(1)');
    expect(
      await within(dialog).findByText(/Nama “process\.exit” tidak dikenal pada karakter 1/),
    ).toBeInTheDocument();
    await user.clear(main);
    await user.type(main, '0.8658 * speedKnot - 0.0197');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Rumus mesin bantu' }),
      '1.5103 * Math.exp(-0.064 * speedKnot)',
    );
    expect(await within(dialog).findAllByText('Rumus valid')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('KM Kepri Indah disimpan')).toBeInTheDocument();
    expect(state.formulas[0]).toMatchObject({
      name: 'KM Kepri Indah',
      mainEngineFormula: '0.8658 * speedKnot - 0.0197',
      auxiliaryEngineFormula: '1.5103 * Math.exp(-0.064 * speedKnot)',
    });
  });

  it('explains REFERENCE_IN_USE when a fuel still used by vessels is deleted', async () => {
    mockReference();
    const user = userEvent.setup();
    renderApp({ route: '/admin/reference-data?tab=fuels', session: { roles: ['super_admin'] } });
    await user.click(
      await screen.findByRole('button', { name: 'Aksi untuk Diesel / gas oil' }, APP),
    );
    await user.click(await screen.findByRole('menuitem', { name: /Hapus/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Hapus Diesel / gas oil?' });
    await user.click(within(confirm).getByRole('button', { name: /Hapus/ }));
    expect(await screen.findByText('Masih dipakai kapal')).toBeInTheDocument();
  });

  it('tells administrators where reference data comes from when a table is empty', async () => {
    mockReference();
    renderApp({
      route: '/admin/reference-data?tab=formulas',
      session: { roles: ['super_admin'] },
    });
    expect(await screen.findByText('Belum ada rumus bahan bakar', {}, APP)).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    server.use(
      http.get('*/api/v2/vessel-types', () => problem(500, 'INTERNAL_ERROR', 'Internal error')),
    );
    renderApp({ route: '/admin/reference-data', session: { roles: ['super_admin'] } });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });
});
