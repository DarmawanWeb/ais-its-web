import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { CreateApiKeyDto, CreatedApiKeyDto } from '@/shared/api/generated/auth/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

import { API_KEYS, APP, MEMBERS, ORGANIZATIONS, page, problem } from './test-fixtures';

const ADMIN = { roles: ['org_admin' as const], org: TEST_IDS.orgA };
const SECRET = 'sk_N3wK3y0001_9vQ4hD2kP0sWmX7cBnR5tY1uE3oL8aZ6';

function mockKeys({ keys = API_KEYS, scopeRefused = false } = {}) {
  const state = { created: [] as CreateApiKeyDto[], revoked: [] as string[] };
  server.use(
    http.get('*/api/v2/organizations/:id', () => HttpResponse.json(ORGANIZATIONS[0])),
    http.get('*/api/v2/organizations/:id/members', () => HttpResponse.json(page(MEMBERS))),
    http.get('*/api/v2/api-keys', () => HttpResponse.json(page(keys))),
    http.post('*/api/v2/api-keys', async ({ request }) => {
      const body = (await request.json()) as CreateApiKeyDto;
      state.created.push(body);
      if (scopeRefused) {
        return problem(403, 'SCOPE_NOT_GRANTABLE', 'Scope not grantable');
      }
      return HttpResponse.json(
        {
          apiKey: {
            id: '0192f0c8-7d3a-7c2e-9a33-000000000099',
            orgId: TEST_IDS.orgA,
            name: body.name,
            prefix: 'sk_N3wK3y0001',
            scopes: body.scopes,
            createdBy: TEST_IDS.user,
            lastUsedAt: null,
            revokedAt: null,
            createdAt: '2026-11-23T00:00:00.000Z',
            key: SECRET,
          },
        } satisfies CreatedApiKeyDto,
        { status: 201 },
      );
    }),
    http.delete('*/api/v2/api-keys/:id', ({ params }) => {
      state.revoked.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Kunci API baru' }, APP));
  return screen.findByRole('dialog', { name: 'Kunci API baru' });
}

describe('API keys page', { timeout: 30_000 }, () => {
  it('lists keys with scopes, creator and usage, and documents the scopes', async () => {
    mockKeys();
    renderApp({ route: '/admin/api-keys', session: ADMIN });
    const table = await screen.findByRole('table', { name: 'Kunci API' }, APP);
    expect(within(table).getByText('Flow meter KM Bahari Nusantara')).toBeInTheDocument();
    expect(within(table).getByText('telemetry:ingest')).toBeInTheDocument();
    expect(await within(table).findByText('Dewi Admin')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cakupan' })).toBeInTheDocument();
  });

  it('offers only grantable scopes and shows the new secret exactly once', async () => {
    const state = mockKeys();
    const user = userEvent.setup();
    renderApp({ route: '/admin/api-keys', session: ADMIN });
    const dialog = await openCreate(user);
    // ais:ingest writes the shared AIS feed: platform administrators only.
    expect(within(dialog).getByRole('checkbox', { name: /ais:ingest/ })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama' }), 'Flow meter KM Rempang');
    // telemetry:ingest is preselected (the common case: a device key).
    expect(within(dialog).getByRole('checkbox', { name: /telemetry:ingest/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Buat kunci' }));

    const secret = await screen.findByRole('dialog', { name: 'Salin kunci sekarang' });
    expect(within(secret).getByDisplayValue(SECRET)).toBeInTheDocument();
    const done = within(secret).getByRole('button', { name: 'Selesai' });
    expect(done).toBeDisabled();
    await user.click(within(secret).getByRole('checkbox', { name: /Saya sudah menyimpan kunci/ }));
    await user.click(done);
    expect(screen.queryByDisplayValue(SECRET)).not.toBeInTheDocument();
    expect(state.created[0]).toEqual({
      name: 'Flow meter KM Rempang',
      scopes: ['telemetry:ingest'],
    });
  });

  it('explains SCOPE_NOT_GRANTABLE when the service refuses a scope', async () => {
    mockKeys({ scopeRefused: true });
    const user = userEvent.setup();
    renderApp({ route: '/admin/api-keys', session: ADMIN });
    const dialog = await openCreate(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama' }), 'Integrasi mitra');
    await user.click(within(dialog).getByRole('checkbox', { name: /telemetry:ingest/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /ais:read/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Buat kunci' }));
    expect(
      await within(dialog).findByText(/hanya diberikan oleh administrator platform/),
    ).toBeInTheDocument();
  });

  it('asks before revoking a key', async () => {
    const state = mockKeys();
    const user = userEvent.setup();
    renderApp({ route: '/admin/api-keys', session: ADMIN });
    await user.click(
      await screen.findByRole('button', { name: /Cabut: Flow meter KM Bahari Nusantara/ }, APP),
    );
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Cabut Flow meter KM Bahari Nusantara?',
    });
    await user.click(within(confirm).getByRole('button', { name: /Cabut/ }));
    expect(await screen.findByText('Kunci Flow meter KM Bahari Nusantara dicabut')).toBeVisible();
    expect(state.revoked).toEqual([API_KEYS[0]!.id]);
  });

  it('tells the admin what to do without keys, and shows errors with retry', async () => {
    mockKeys({ keys: [] });
    const { unmount } = renderApp({ route: '/admin/api-keys', session: ADMIN });
    expect(await screen.findByText('Belum ada kunci API', {}, APP)).toBeInTheDocument();
    unmount();
    server.use(http.get('*/api/v2/api-keys', () => problem(500, 'INTERNAL_ERROR', 'Internal')));
    renderApp({ route: '/admin/api-keys', session: ADMIN });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });

  it('is forbidden for fleet managers', async () => {
    renderApp({ route: '/admin/api-keys', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kunci API baru' })).not.toBeInTheDocument();
  });
});
