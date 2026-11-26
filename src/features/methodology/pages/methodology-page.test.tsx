import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { EmissionMethodologyDto } from '@/shared/api/generated/emission/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';

const APP = { timeout: 15_000 };

const SERVICE: EmissionMethodologyDto = {
  service: 'emission',
  methods: [
    {
      // an id the installed catalog lacks (the service runs a method not catalogued yet)
      id: 'cii.example_uncatalogued_projection',
      catalogued: false,
      domain: 'emission',
      name: { id: 'Proyeksi linear akhir tahun', en: 'Linear year-end projection' },
      status: 'implemented',
      needsCitation: false,
      references: [{ id: 'platform-spec', title: 'Platform spec §13.5', url: null }],
      summary: {
        id: 'Total sejak awal tahun dibagi fraksi tahun berjalan.',
        en: 'Year-to-date totals divided by the elapsed fraction of the year.',
      },
      formulaLatex: '\\hat{X} = X_{ytd} / f',
      variables: [],
      constants: [],
      referenceIds: [],
    },
  ],
  reductionFactors: [{ year: 2026, zPercent: 11, source: 'IMO MEPC.338(76)' }],
  vesselTypes: [
    {
      id: 't1',
      code: 'tanker',
      name: 'Tanker',
      capacityUnit: 'DWT',
      a: 5247,
      c: 0.61,
      capacityFixed: null,
      d: { d1: 0.82, d2: 0.93, d3: 1.08, d4: 1.28 },
      references: [],
    },
  ],
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
};

function mockService(ok = true) {
  server.use(
    http.get('*/api/v2/emission/methodology', () =>
      ok
        ? HttpResponse.json(SERVICE)
        : HttpResponse.json(
            { type: 'about:blank', title: 'Unavailable', status: 503, code: 'UNAVAILABLE' },
            { status: 503 },
          ),
    ),
  );
}

describe('MethodologyPage', () => {
  it('renders the catalog by domain, service methods, the bibliography and parameters', async () => {
    mockService();
    renderApp({ route: '/methodology', session: { roles: ['viewer'] } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Metodologi & Referensi' }, APP),
    ).toBeInTheDocument();
    const emission = await screen.findByRole('region', { name: /Bahan bakar, emisi dan CII/ }, APP);
    const card = within(emission).getByRole('article', { name: /CII attained/ });
    expect(card).toHaveAttribute('id', 'cii.attained_accumulation');
    // An uncatalogued method of the emission service is merged and labelled.
    const projection = await screen.findByRole(
      'article',
      { name: 'Proyeksi linear akhir tahun' },
      APP,
    );
    expect(within(projection).getByText('Belum dikatalogkan')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pustaka' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Parameter aktif layanan emisi' }),
    ).toBeInTheDocument();
  }, 30_000);

  it('filters methods and explains an empty result', async () => {
    mockService();
    const user = userEvent.setup();
    renderApp({ route: '/methodology', session: { roles: ['viewer'] } });
    const search = await screen.findByRole('searchbox', { name: /Cari metode/ }, APP);
    await user.type(search, 'zzzz-tidak-ada');
    expect(
      await screen.findByText('Tidak ada metode yang cocok', undefined, APP),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Hapus filter' })[0]!);
    expect(await screen.findByRole('article', { name: /CII attained/ }, APP)).toBeInTheDocument();
  }, 30_000);

  it('keeps the catalog when the emission service is unavailable', async () => {
    mockService(false);
    renderApp({ route: '/methodology', session: { roles: ['viewer'] } });
    expect(
      await screen.findByText(
        /tidak dapat dimuat saat ini; katalog utama tetap lengkap/,
        undefined,
        APP,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /CII attained/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Parameter aktif layanan emisi' })).toBeNull();
  }, 30_000);

  it('focuses the method of a deep link (#<methodId>)', async () => {
    mockService();
    renderApp({ route: '/methodology#cii.rating_grade', session: { roles: ['viewer'] } });
    await waitFor(
      () => expect(document.activeElement).toHaveAttribute('id', 'cii.rating_grade'),
      APP,
    );
  }, 30_000);
});
