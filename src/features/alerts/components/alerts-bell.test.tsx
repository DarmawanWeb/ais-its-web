import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw/server';

import { ALERT, pageOf, SUMMARY, WARNING_ALERT } from '../test/fixtures';
import { AlertsBell } from './alerts-bell';

describe('AlertsBell', () => {
  it('shows the open count and the latest alerts with a link to the inbox', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v2/alerts/summary', () => HttpResponse.json(SUMMARY)),
      http.get('*/api/v2/alerts', () =>
        HttpResponse.json(pageOf([ALERT, { ...WARNING_ALERT, status: 'acknowledged' }])),
      ),
    );
    renderWithProviders(<AlertsBell />);
    const bell = await screen.findByRole('button', { name: 'Alert, 2 terbuka' });
    expect(within(bell).getByTestId('alerts-bell-count')).toHaveTextContent('2');

    await user.click(bell);
    const list = await screen.findByRole('list', { name: 'Alert terbaru' });
    expect(
      within(list).getByRole('link', { name: /Bahaya EWS: KM Bahari Nusantara/ }),
    ).toHaveAttribute('href', `/alerts?alert=${ALERT.id}&status=all`);
    expect(within(list).getByText('Diterima')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat semua alert' })).toHaveAttribute(
      'href',
      '/alerts',
    );
  });

  it('stays usable when the notification service is unavailable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertsBell />);
    const bell = await screen.findByRole('button', { name: 'Alert' });
    await user.click(bell);
    expect(await screen.findByText('Daftar alert belum dapat dimuat.')).toBeInTheDocument();
    expect(await screen.findByText('Jumlah alert belum tersedia')).toBeInTheDocument();
  });

  it('explains an empty inbox', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v2/alerts/summary', () =>
        HttpResponse.json({
          ...SUMMARY,
          total: 0,
          bySeverity: { info: 0, warning: 0, critical: 0 },
        }),
      ),
      http.get('*/api/v2/alerts', () => HttpResponse.json(pageOf([]))),
    );
    renderWithProviders(<AlertsBell />);
    await user.click(await screen.findByRole('button', { name: 'Alert' }));
    expect(await screen.findByText('Belum ada alert')).toBeInTheDocument();
  });
});
