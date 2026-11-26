import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { AlertDto } from '@/shared/api/generated/notification/model';
import { renderApp } from '@/test/render';
import { server } from '@/test/msw/server';

import { ALERT, pageOf, SUMMARY, WARNING_ALERT } from '../test/fixtures';

// MapLibre needs WebGL (not in jsdom): the drawer's mini map is replaced.
vi.mock('../components/alert-mini-map', () => ({
  AlertMiniMap: () => <div data-testid="alert-mini-map" />,
}));

function mockInbox(alerts: AlertDto[] = [ALERT, WARNING_ALERT]) {
  const acknowledged: string[] = [];
  server.use(
    http.get('*/api/v2/alerts/summary', () => HttpResponse.json(SUMMARY)),
    http.get('*/api/v2/alerts', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status');
      return HttpResponse.json(pageOf(alerts.filter((a) => !status || a.status === status)));
    }),
    http.get('*/api/v2/alerts/:id', ({ params }) => {
      const alert = alerts.find((a) => a.id === params.id);
      return alert
        ? HttpResponse.json(alert)
        : HttpResponse.json(
            { status: 404, code: 'ALERT_NOT_FOUND', title: 'Alert not found' },
            { status: 404 },
          );
    }),
    http.post('*/api/v2/alerts/:id/ack', ({ params }) => {
      acknowledged.push(String(params.id));
      const alert = alerts.find((a) => a.id === params.id) as AlertDto;
      return HttpResponse.json({
        ...alert,
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
      });
    }),
  );
  return { acknowledged };
}

/** The app shell and the lazy page can take a while on a busy machine. */
const APP = { timeout: 10_000 };

describe('AlertsPage', { timeout: 30_000 }, () => {
  it('lists the open alerts with the summary and the realtime state', async () => {
    mockInbox();
    renderApp({ route: '/alerts' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Alert' }, APP),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Kotak masuk alert' });
    expect(await within(table).findByText('Bahaya EWS: KM Bahari Nusantara')).toBeInTheDocument();
    expect(
      within(table).getByText('Risiko tubrukan: TB Pelita 5 ↔ Lion City Spirit'),
    ).toBeInTheDocument();
    expect(within(table).getAllByText('Terbuka')).toHaveLength(2);
    expect(screen.getByText('Keselamatan 2 · Pengawasan 0')).toBeInTheDocument();
  });

  it('explains an empty inbox', async () => {
    mockInbox([]);
    renderApp({ route: '/alerts' });
    expect(await screen.findByText('Tidak ada alert terbuka', {}, APP)).toBeInTheDocument();
  });

  it('suggests resetting filters when nothing matches them', async () => {
    mockInbox([]);
    renderApp({ route: '/alerts?severity=critical' });
    expect(await screen.findByText('Tidak ada alert yang cocok', {}, APP)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Atur ulang filter/ }).length).toBeGreaterThan(0);
  });

  it('shows the problem of a failed list with a retry', async () => {
    mockInbox();
    server.use(
      http.get('*/api/v2/alerts', () =>
        HttpResponse.json(
          { status: 503, code: 'SERVICE_UNAVAILABLE', title: 'Unavailable' },
          { status: 503 },
        ),
      ),
    );
    renderApp({ route: '/alerts' });
    expect(await screen.findByRole('button', { name: 'Coba lagi' }, APP)).toBeInTheDocument();
  });

  it('hides acknowledge and resolve from roles without alert:ack', async () => {
    mockInbox();
    renderApp({ route: '/alerts', session: { roles: ['viewer'] } });
    await screen.findByText('Bahaya EWS: KM Bahari Nusantara', {}, APP);
    expect(screen.queryByRole('button', { name: /Terima:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Selesaikan:/ })).not.toBeInTheDocument();
  });

  it('acknowledges optimistically and opens the detail drawer from the row', async () => {
    const user = userEvent.setup();
    const { acknowledged } = mockInbox();
    renderApp({ route: '/alerts?status=all', session: { roles: ['fleet_manager'] } });
    await user.click(
      await screen.findByRole('button', { name: 'Terima: Bahaya EWS: KM Bahari Nusantara' }, APP),
    );
    await waitFor(() => expect(acknowledged).toEqual([ALERT.id]));
    expect(await screen.findByText('Alert diterima')).toBeInTheDocument();

    await user.click(screen.getByText('Risiko tubrukan: TB Pelita 5 ↔ Lion City Spirit'));
    const drawer = await screen.findByTestId('alert-detail');
    expect(within(drawer).getByRole('heading', { name: WARNING_ALERT.title })).toBeInTheDocument();
    expect(within(drawer).getByText('Linimasa kejadian')).toBeInTheDocument();
    expect(within(drawer).getByText('CPA')).toBeInTheDocument();
    expect(within(drawer).getByTestId('alert-mini-map')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Terima' })).toBeInTheDocument();
  });
});
