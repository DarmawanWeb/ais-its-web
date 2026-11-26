import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  InviteMemberDto,
  MemberDto,
  SentInvitationDto,
} from '@/shared/api/generated/auth/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

import { APP, INVITATIONS, MEMBERS, ORGANIZATIONS, page, problem } from './test-fixtures';

const ADMIN = { roles: ['org_admin' as const], org: TEST_IDS.orgA };

function mockMembers(members: MemberDto[] = MEMBERS) {
  const state = { invites: [] as InviteMemberDto[], removed: [] as string[] };
  server.use(
    http.get('*/api/v2/organizations/:id', () => HttpResponse.json(ORGANIZATIONS[0])),
    http.get('*/api/v2/organizations/:id/members', () => HttpResponse.json(page(members))),
    http.get('*/api/v2/organizations/:id/invitations', () => HttpResponse.json(page(INVITATIONS))),
    http.post('*/api/v2/organizations/:id/members', async ({ request }) => {
      const body = (await request.json()) as InviteMemberDto;
      state.invites.push(body);
      if (body.role === 'authority') {
        return problem(422, 'ROLE_NOT_GRANTABLE', 'Role not grantable');
      }
      return HttpResponse.json(
        {
          id: '0192f0c8-7d3a-7c2e-9a32-000000000099',
          email: body.email,
          name: body.name,
          role: body.role,
          invitedBy: TEST_IDS.user,
          createdAt: '2026-11-23T00:00:00.000Z',
          expiresAt: '2026-11-30T00:00:00.000Z',
          expired: false,
          invitationSent: true,
        } satisfies SentInvitationDto,
        { status: 201 },
      );
    }),
    http.patch('*/api/v2/organizations/:id/members/:userId', () =>
      problem(409, 'LAST_ORG_ADMIN', 'An organization must keep at least one org_admin'),
    ),
    http.delete('*/api/v2/organizations/:id/members/:userId', ({ params }) => {
      state.removed.push(String(params.userId));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('members page', { timeout: 30_000 }, () => {
  it('lists the members of the active organization with roles, MFA and invitations', async () => {
    mockMembers();
    renderApp({ route: '/admin/members', session: ADMIN });
    const table = await screen.findByRole('table', { name: 'Anggota' }, APP);
    expect(within(table).getByText('Dewi Admin')).toBeInTheDocument();
    expect(within(table).getByText('Admin organisasi')).toBeInTheDocument();
    expect(within(table).getByText('Pengamat')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Undangan/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Undang anggota' })).toBeInTheDocument();
    // Shipping company: the authority role is not offered.
    expect(await screen.findByText(/Peran otoritas hanya tersedia/, {}, APP)).toBeInTheDocument();
  });

  it('invites by e-mail with a role and never offers the authority role here', async () => {
    const state = mockMembers();
    const user = userEvent.setup();
    renderApp({ route: '/admin/members', session: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Undang anggota' }, APP));
    const dialog = await screen.findByRole('dialog', { name: 'Undang anggota' });
    expect(within(dialog).queryByRole('radio', { name: /^Otoritas/ })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'E-mail' }), 'nakhoda@pelni.test');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama' }), 'Nakhoda Baru');
    await user.click(within(dialog).getByRole('radio', { name: /Manajer armada/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Kirim undangan' }));
    expect(await screen.findByText('Undangan dikirim ke nakhoda@pelni.test')).toBeInTheDocument();
    expect(state.invites[0]).toMatchObject({
      email: 'nakhoda@pelni.test',
      name: 'Nakhoda Baru',
      role: 'fleet_manager',
    });
  });

  it('protects the last org admin: the role dialog only keeps org_admin selectable', async () => {
    mockMembers();
    const user = userEvent.setup();
    renderApp({ route: '/admin/members', session: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Aksi untuk Dewi Admin' }, APP));
    await user.click(await screen.findByRole('menuitem', { name: /Ubah peran/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ubah peran' });
    expect(within(dialog).getByText(/admin organisasi terakhir/)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Pengamat/ })).toBeDisabled();
  });

  it('asks before removing a member and removes it', async () => {
    const state = mockMembers();
    const user = userEvent.setup();
    renderApp({ route: '/admin/members', session: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Aksi untuk Budi Santoso' }, APP));
    await user.click(await screen.findByRole('menuitem', { name: /Keluarkan dari organisasi/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Keluarkan Budi Santoso?' });
    await user.click(within(confirm).getByRole('button', { name: /Keluarkan/ }));
    expect(await screen.findByText('Budi Santoso dikeluarkan')).toBeInTheDocument();
    expect(state.removed).toEqual([MEMBERS[1]!.userId]);
  });

  it('tells the admin how to start when nobody joined yet', async () => {
    mockMembers([]);
    renderApp({ route: '/admin/members', session: ADMIN });
    expect(await screen.findByText('Belum ada anggota', {}, APP)).toBeInTheDocument();
    expect(screen.getByText(/Undang anggota pertama/)).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    server.use(
      http.get('*/api/v2/organizations/:id/members', () =>
        problem(503, 'SERVICE_UNAVAILABLE', 'Service unavailable'),
      ),
      http.get('*/api/v2/organizations/:id/invitations', () => HttpResponse.json(page([]))),
    );
    renderApp({ route: '/admin/members', session: ADMIN });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });

  it('is forbidden for fleet managers', async () => {
    renderApp({ route: '/admin/members', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undang anggota' })).not.toBeInTheDocument();
  });
});
