import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  CreateOrganizationDto,
  OrganizationDto,
  UpdateOrganizationDto,
} from '@/shared/api/generated/auth/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

import { APP, DIRECTORY, ORGANIZATIONS, page, problem } from './test-fixtures';

function mockOrganizations(organizations: OrganizationDto[] = ORGANIZATIONS) {
  const state = {
    organizations: [...organizations],
    created: [] as CreateOrganizationDto[],
    updated: [] as UpdateOrganizationDto[],
  };
  server.use(
    http.get('*/api/v2/organizations', () => HttpResponse.json(page(state.organizations))),
    http.post('*/api/v2/organizations', async ({ request }) => {
      const body = (await request.json()) as CreateOrganizationDto;
      state.created.push(body);
      const created: OrganizationDto = {
        id: '0192f0c8-7d3a-7c2e-9a30-000000000077',
        name: body.name,
        slug: body.slug ?? 'otoritas-pelabuhan-dumai',
        kind: body.kind,
        createdAt: '2026-11-23T00:00:00.000Z',
        updatedAt: '2026-11-23T00:00:00.000Z',
      };
      state.organizations.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch('*/api/v2/organizations/:id', async ({ request }) => {
      state.updated.push((await request.json()) as UpdateOrganizationDto);
      return problem(409, 'ORGANIZATION_KIND_CONFLICT', 'Organization kind conflict', {
        detail: 'members hold the role authority',
      });
    }),
    http.get('*/api/v2/users', () => HttpResponse.json(page(DIRECTORY))),
  );
  return state;
}

describe('organizations page', { timeout: 30_000 }, () => {
  it('lists organizations with their kind and counts them per kind', async () => {
    mockOrganizations();
    renderApp({ route: '/admin/organizations', session: { roles: ['super_admin'] } });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Organisasi' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Organisasi' }, APP);
    expect(within(table).getByText('KSOP Batam')).toBeInTheDocument();
    expect(within(table).getByText('ksop-batam')).toBeInTheDocument();
    expect(within(table).getAllByText('Otoritas').length).toBeGreaterThan(0);
    const stats = screen.getByRole('region', { name: 'Organisasi per jenis' });
    expect(within(stats).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organisasi baru' })).toBeInTheDocument();
  });

  it('creates an organization with an automatic slug', async () => {
    const state = mockOrganizations();
    const user = userEvent.setup();
    renderApp({ route: '/admin/organizations', session: { roles: ['super_admin'] } });
    await user.click(await screen.findByRole('button', { name: 'Organisasi baru' }, APP));
    const dialog = await screen.findByRole('dialog', { name: 'Organisasi baru' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nama' }),
      'Otoritas Pelabuhan Dumai',
    );
    expect(within(dialog).getByText(/otoritas-pelabuhan-dumai/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: /Otoritas/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Buat organisasi' }));
    expect(
      await screen.findByText('Organisasi Otoritas Pelabuhan Dumai dibuat'),
    ).toBeInTheDocument();
    expect(state.created[0]).toMatchObject({ name: 'Otoritas Pelabuhan Dumai', kind: 'authority' });
  });

  it('explains ORGANIZATION_KIND_CONFLICT when a kind change strands authority roles', async () => {
    const state = mockOrganizations();
    const user = userEvent.setup();
    renderApp({ route: '/admin/organizations', session: { roles: ['super_admin'] } });
    await user.click(await screen.findByRole('button', { name: 'Aksi untuk KSOP Batam' }, APP));
    await user.click(await screen.findByRole('menuitem', { name: /Ubah/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ubah organisasi' });
    await user.click(within(dialog).getByRole('radio', { name: /Riset/ }));
    // Leaving the authority kind warns before saving …
    expect(within(dialog).getByText(/menghalangi perubahan ini/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    // … and the service's conflict is explained in the dialog.
    const title = await within(dialog).findByText('Organisasi tidak dapat disimpan');
    expect(title.closest('[role="alert"]')).toHaveTextContent(
      /peran otoritas memerlukan organisasi otoritas/,
    );
    expect(state.updated[0]).toEqual({ kind: 'research' });
  });

  it('tells the platform administrator what to do when there is no organization', async () => {
    mockOrganizations([]);
    renderApp({ route: '/admin/organizations', session: { roles: ['super_admin'] } });
    expect(await screen.findByText('Belum ada organisasi', {}, APP)).toBeInTheDocument();
    expect(screen.getByText(/Buat organisasi pertama/)).toBeInTheDocument();
  });

  it('shows an error state with retry when the list fails', async () => {
    server.use(
      http.get('*/api/v2/organizations', () => problem(500, 'INTERNAL_ERROR', 'Internal error')),
    );
    renderApp({ route: '/admin/organizations', session: { roles: ['super_admin'] } });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });

  it('is forbidden for organization admins (org:manage is a platform permission)', async () => {
    renderApp({
      route: '/admin/organizations',
      session: { roles: ['org_admin'], org: TEST_IDS.orgA },
    });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Organisasi baru' })).not.toBeInTheDocument(),
    );
  });
});
