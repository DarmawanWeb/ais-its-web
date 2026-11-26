import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type {
  ChangePasswordDto,
  MeDto,
  MfaCodeDto,
  SessionDto,
  SessionsControllerList200,
} from '@/shared/api/generated/auth/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

const APP = { timeout: 10_000 };

function problem(status: number, code: string, title: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, status, code, title, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

const ME = {
  id: TEST_IDS.user,
  email: 'nakhoda@pelni.test',
  name: 'Rina Nakhoda',
  status: 'active',
  mfaEnabled: false,
  isPlatformAdmin: false,
  lastLoginAt: '2026-11-22T08:00:00.000Z',
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  memberships: [
    {
      orgId: TEST_IDS.orgA,
      orgName: 'PT Pelayaran Nusantara',
      orgSlug: 'pelayaran-nusantara',
      orgKind: 'shipping_company',
      role: 'fleet_manager',
      joinedAt: '2026-01-10T00:00:00.000Z',
    },
    {
      orgId: TEST_IDS.orgB,
      orgName: 'Otoritas Pelabuhan Batam',
      orgSlug: 'otoritas-batam',
      orgKind: 'authority',
      role: 'authority',
      joinedAt: '2026-03-01T00:00:00.000Z',
    },
  ],
  activeOrgId: TEST_IDS.orgA,
  roles: ['fleet_manager'],
  permissions: ['vessel:read'],
} satisfies MeDto;

const SESSIONS: SessionDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1b-bbbbbbbbbbbb',
    orgId: TEST_IDS.orgA,
    createdAt: '2026-11-18T07:00:00.000Z',
    lastUsedAt: '2026-11-21T07:00:00.000Z',
    ip: '36.84.12.7',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1',
    current: false,
  },
  {
    id: TEST_IDS.session,
    orgId: TEST_IDS.orgA,
    createdAt: '2026-11-22T08:00:00.000Z',
    lastUsedAt: '2026-11-22T08:10:00.000Z',
    ip: '10.0.0.5',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
    current: true,
  },
];

function mockProfile({
  me = ME,
  sessions = SESSIONS,
  meError = false,
}: { me?: MeDto; sessions?: SessionDto[]; meError?: boolean } = {}) {
  const state = { me: { ...me }, sessions: [...sessions], revoked: [] as string[] };
  server.use(
    http.get('*/api/v2/me', () =>
      meError ? problem(500, 'INTERNAL_ERROR', 'Internal error') : HttpResponse.json(state.me),
    ),
    http.patch('*/api/v2/me', async ({ request }) => {
      const body = (await request.json()) as { name: string };
      state.me = { ...state.me, name: body.name };
      return HttpResponse.json({ ...state.me });
    }),
    http.get('*/api/v2/auth/sessions', () =>
      HttpResponse.json({
        data: state.sessions,
        meta: { page: 1, pageSize: 100, total: state.sessions.length },
      } satisfies SessionsControllerList200),
    ),
    http.delete('*/api/v2/auth/sessions/:id', ({ params }) => {
      state.revoked.push(String(params.id));
      state.sessions = state.sessions.filter((session) => session.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('profile page', { timeout: 30_000 }, () => {
  it('shows the account, roles, memberships and sessions with this session first', async () => {
    mockProfile();
    renderApp({ route: '/profile' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profil & Keamanan' }, APP),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Rina Nakhoda');
    expect(screen.getAllByText('Manajer armada').length).toBeGreaterThan(0);
    expect(screen.getByText('MFA belum aktif')).toBeInTheDocument();

    const sessions = await screen.findByRole('list', { name: 'Daftar sesi aktif' });
    const items = within(sessions).getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(within(items[0]!).getByText('Sesi ini')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Chrome di Windows')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Safari di iOS')).toBeInTheDocument();
    // The current session offers "sign out", never "revoke".
    expect(within(items[0]!).queryByRole('button', { name: /Cabut sesi/ })).toBeNull();

    const memberships = screen.getByRole('list', { name: 'Daftar keanggotaan' });
    expect(within(memberships).getByText('Otoritas Pelabuhan Batam')).toBeInTheDocument();
    expect(
      within(memberships).getByRole('button', { name: /Jadikan aktif: Otoritas Pelabuhan Batam/ }),
    ).toBeInTheDocument();
  });

  it('renames the account', async () => {
    const state = mockProfile();
    const user = userEvent.setup();
    renderApp({ route: '/profile' });
    await user.click(await screen.findByRole('button', { name: /Ubah nama/ }, APP));
    const input = screen.getByRole('textbox', { name: 'Nama tampil' });
    await user.clear(input);
    await user.type(input, 'Rina Nakhoda Utama');
    await user.click(screen.getByRole('button', { name: /Simpan/ }));
    expect(await screen.findByText('Nama berhasil diperbarui')).toBeInTheDocument();
    expect(state.me.name).toBe('Rina Nakhoda Utama');
    await waitFor(() =>
      expect(screen.getByTestId('profile-name')).toHaveTextContent('Rina Nakhoda Utama'),
    );
  });

  it('maps a wrong current password to its field and checks the policy first', async () => {
    mockProfile();
    const bodies: ChangePasswordDto[] = [];
    server.use(
      http.post('*/api/v2/auth/password/change', async ({ request }) => {
        bodies.push((await request.json()) as ChangePasswordDto);
        return problem(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [
            {
              field: 'currentPassword',
              message: 'The current password is incorrect',
              code: 'password_mismatch',
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/profile' });
    await user.type(await screen.findByLabelText('Kata sandi saat ini', {}, APP), 'Lama12345');
    await user.type(screen.getByLabelText('Kata sandi baru'), 'pendek');
    await user.type(screen.getByLabelText('Ulangi kata sandi baru'), 'pendek');
    await user.click(screen.getByRole('button', { name: /Ganti kata sandi/ }));
    expect(
      await screen.findByText('Kata sandi belum memenuhi semua ketentuan'),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.clear(screen.getByLabelText('Kata sandi baru'));
    await user.type(screen.getByLabelText('Kata sandi baru'), 'Selat-Malaka-2026');
    await user.clear(screen.getByLabelText('Ulangi kata sandi baru'));
    await user.type(screen.getByLabelText('Ulangi kata sandi baru'), 'Selat-Malaka-2026');
    await user.click(screen.getByRole('button', { name: /Ganti kata sandi/ }));
    expect(await screen.findByText('Kata sandi saat ini salah')).toBeInTheDocument();
    expect(bodies).toEqual([{ currentPassword: 'Lama12345', newPassword: 'Selat-Malaka-2026' }]);
  });

  it('enables MFA with the QR code, the manual secret and a code', async () => {
    const state = mockProfile();
    const codes: string[] = [];
    let attempts = 0;
    server.use(
      http.post('*/api/v2/auth/mfa/setup', () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl:
            'otpauth://totp/AIS%20Maritime%20Intelligence:nakhoda%40pelni.test?secret=JBSWY3DPEHPK3PXP&issuer=AIS%20Maritime%20Intelligence',
        }),
      ),
      http.post('*/api/v2/auth/mfa/enable', async ({ request }) => {
        attempts += 1;
        const { code } = (await request.json()) as MfaCodeDto;
        codes.push(code);
        if (code !== '123456') {
          return problem(401, 'INVALID_MFA_CODE', 'Invalid MFA code');
        }
        state.me = { ...state.me, mfaEnabled: true };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/profile' });
    await user.click(await screen.findByRole('button', { name: /Aktifkan MFA/ }, APP));
    const dialog = await screen.findByRole('dialog', { name: /Aktifkan autentikasi dua langkah/ });
    expect(
      await within(dialog).findByRole('img', { name: 'Kode QR untuk aplikasi autentikator' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('mfa-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(
      within(dialog).getByText(/Akun nakhoda@pelni.test · penerbit AIS Maritime Intelligence/),
    ).toBeInTheDocument();

    const code = within(dialog).getByLabelText('Kode verifikasi');
    await user.type(code, '000000');
    await user.click(within(dialog).getByRole('button', { name: /^Aktifkan$/ }));
    expect(
      await within(dialog).findByText(/Kode tidak valid atau sudah dipakai/),
    ).toBeInTheDocument();
    // A wrong code is not retried behind the user's back (throttle of 5 attempts).
    expect(attempts).toBe(1);

    await user.type(code, '12 34 56');
    await user.click(within(dialog).getByRole('button', { name: /^Aktifkan$/ }));
    expect(await screen.findByText('MFA berhasil diaktifkan')).toBeInTheDocument();
    expect(codes).toEqual(['000000', '123456']);
    await waitFor(() => expect(screen.getByTestId('mfa-status')).toHaveTextContent('Aktif'));
  });

  it('revokes another session after a confirmation', async () => {
    const state = mockProfile();
    const user = userEvent.setup();
    renderApp({ route: '/profile' });
    const sessions = await screen.findByRole('list', { name: 'Daftar sesi aktif' }, APP);
    await user.click(within(sessions).getByRole('button', { name: /Cabut sesi: Safari di iOS/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Cabut sesi ini?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cabut sesi' }));
    expect(await screen.findByText('1 sesi telah dicabut')).toBeInTheDocument();
    expect(state.revoked).toEqual([SESSIONS[0]!.id]);
    await waitFor(() => expect(within(sessions).getAllByRole('listitem')).toHaveLength(1));
  });

  it('shows the problem when the profile cannot be loaded', async () => {
    mockProfile({ meError: true });
    renderApp({ route: '/profile' });
    const alert = await screen.findByRole('alert', {}, APP);
    expect(within(alert).getByText('Server mengalami gangguan')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /Coba lagi/ })).toBeInTheDocument();
  });
});
