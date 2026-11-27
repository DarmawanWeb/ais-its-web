import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { AuditLogDto, AuditLogsControllerList200 } from '@/shared/api/generated/auth/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

import { APP, AUDIT, MEMBERS, ORGANIZATIONS, page, problem } from './test-fixtures';

const ADMIN = { roles: ['org_admin' as const], org: TEST_IDS.orgA };

function mockAudit(records: AuditLogDto[] = AUDIT) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get('*/api/v2/organizations/:id', () => HttpResponse.json(ORGANIZATIONS[0])),
    http.get('*/api/v2/organizations/:id/members', () => HttpResponse.json(page(MEMBERS))),
    http.get('*/api/v2/audit-logs/actions', () =>
      HttpResponse.json({
        data: [{ action: 'membership.update', count: 1, lastAt: '2026-11-22T08:00:00.000Z' }],
      }),
    ),
    http.get('*/api/v2/audit-logs', ({ request }) => {
      const query = new URL(request.url).searchParams;
      queries.push(query);
      const action = query.get('action');
      return HttpResponse.json({
        data: records.filter((r) => !action || r.action === action),
        page: { nextCursor: null, limit: 50 },
      } satisfies AuditLogsControllerList200);
    }),
  );
  return queries;
}

describe('audit log page', { timeout: 30_000 }, () => {
  it('lists readable records: actor names, translated actions and targets', async () => {
    mockAudit();
    renderApp({ route: '/admin/audit-log', session: ADMIN });
    const table = await screen.findByRole('table', { name: 'Catatan audit' }, APP);
    expect(within(table).getByText('Peran anggota diubah')).toBeInTheDocument();
    expect(within(table).getByText('membership.update')).toBeInTheDocument();
    // Names captured by the auth service with the record (auth 0.2).
    expect(await within(table).findByText('Siti Rahma')).toBeInTheDocument();
    expect(within(table).getByText('siti.rahma@pelni.test')).toBeInTheDocument();
    expect(within(table).getByText('Budi Santoso <budi.santoso@pelni.test>')).toBeInTheDocument();
    expect(within(table).getByText('Gagal masuk')).toBeInTheDocument();
    expect(within(table).getByText('Sistem')).toBeInTheDocument();
  });

  it('filters by action (exact match, sent to the API)', async () => {
    const queries = mockAudit();
    const user = userEvent.setup();
    renderApp({ route: '/admin/audit-log', session: ADMIN });
    await screen.findByRole('table', { name: 'Catatan audit' }, APP);
    await user.type(screen.getByRole('combobox', { name: 'Aksi' }), 'auth.login.failed');
    await waitFor(() => expect(queries.at(-1)?.get('action')).toBe('auth.login.failed'));
    const table = screen.getByRole('table', { name: 'Catatan audit' });
    await waitFor(() =>
      expect(within(table).queryByText('Peran anggota diubah')).not.toBeInTheDocument(),
    );
    expect(queries.at(-1)?.get('from')).toBeTruthy();
  });

  it('opens a record with a readable diff of its metadata', async () => {
    mockAudit();
    const user = userEvent.setup();
    renderApp({ route: '/admin/audit-log', session: ADMIN });
    const table = await screen.findByRole('table', { name: 'Catatan audit' }, APP);
    await user.click(within(table).getByText('Peran anggota diubah'));
    const sheet = await screen.findByRole('dialog', { name: 'Catatan audit' });
    const changes = within(sheet).getByRole('list', { name: 'Nilai yang berubah' });
    expect(within(changes).getByText('viewer')).toBeInTheDocument();
    expect(within(changes).getByText('fleet_manager')).toBeInTheDocument();
    expect(within(sheet).getByText('36.85.110.4')).toBeInTheDocument();
  });

  it('distinguishes an empty log from no matches, and shows errors with retry', async () => {
    mockAudit([]);
    const { unmount } = renderApp({ route: '/admin/audit-log', session: ADMIN });
    expect(
      await screen.findByText('Tidak ada catatan audit dalam 30 hari terakhir', {}, APP),
    ).toBeInTheDocument();
    unmount();
    server.use(http.get('*/api/v2/audit-logs', () => problem(500, 'INTERNAL_ERROR', 'Internal')));
    renderApp({ route: '/admin/audit-log', session: ADMIN });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });

  it('is forbidden for viewers', async () => {
    renderApp({ route: '/admin/audit-log', session: { roles: ['viewer'] } });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
  });
});
