import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { CreateDeviceDto, DeviceDto } from '@/shared/api/generated/telemetry/model';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render';
import { TEST_IDS } from '@/test/tokens';

import {
  API_KEYS,
  APP,
  DEVICES,
  MEMBERS,
  mockVessels,
  ORGANIZATIONS,
  page,
  problem,
} from './test-fixtures';

const ADMIN = { roles: ['org_admin' as const], org: TEST_IDS.orgA };

function mockDevices(devices: DeviceDto[] = DEVICES) {
  const state = { created: [] as CreateDeviceDto[], deleted: [] as string[] };
  mockVessels();
  server.use(
    http.get('*/api/v2/organizations/:id', () => HttpResponse.json(ORGANIZATIONS[0])),
    http.get('*/api/v2/organizations/:id/members', () => HttpResponse.json(page(MEMBERS))),
    http.get('*/api/v2/api-keys', () => HttpResponse.json(page(API_KEYS))),
    http.get('*/api/v2/telemetry/devices', () => HttpResponse.json(page(devices))),
    http.post('*/api/v2/telemetry/devices', async ({ request }) => {
      const body = (await request.json()) as CreateDeviceDto;
      state.created.push(body);
      return problem(409, 'DEVICE_API_KEY_TAKEN', 'API key taken');
    }),
    http.delete('*/api/v2/telemetry/devices/:id', ({ params }) => {
      state.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('devices page', { timeout: 30_000 }, () => {
  it('lists devices with vessel, connection, credential and connection state', async () => {
    mockDevices();
    renderApp({ route: '/admin/devices', session: ADMIN });
    const table = await screen.findByRole('table', { name: 'Perangkat telemetri' }, APP);
    expect(within(table).getByText('Flow meter ME KM Bahari Nusantara')).toBeInTheDocument();
    expect(await within(table).findByText('KM Bahari Nusantara')).toBeInTheDocument();
    expect(within(table).getByText('Daring')).toBeInTheDocument();
    expect(within(table).getAllByText('Nonaktif').length).toBeGreaterThan(0);
    expect(within(table).getByText(API_KEYS[0]!.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daftarkan perangkat' })).toBeInTheDocument();
  });

  it('shows the MQTT topic and an example payload in the connection guide', async () => {
    mockDevices();
    const user = userEvent.setup();
    renderApp({ route: '/admin/devices', session: ADMIN });
    await user.click(
      await screen.findByRole('button', { name: 'Aksi untuk Gateway MQTT MV Batam Express' }, APP),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Panduan koneksi' }));
    const guide = await screen.findByRole('dialog', { name: 'Panduan koneksi' });
    expect(within(guide).getByText(DEVICES[1]!.mqttTopic!)).toBeInTheDocument();
    expect(within(guide).getByText(/"fuelMeTon": 0.042/)).toBeInTheDocument();
  });

  it('requires an API key for HTTP devices and maps DEVICE_API_KEY_TAKEN to the key field', async () => {
    const state = mockDevices();
    const user = userEvent.setup();
    renderApp({ route: '/admin/devices', session: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Daftarkan perangkat' }, APP));
    const dialog = await screen.findByRole('dialog', { name: 'Daftarkan perangkat' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Kapal' }));
    await user.click(await screen.findByRole('option', { name: /KM Bahari Nusantara/ }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nama' }), 'Flow meter AE');
    await user.click(within(dialog).getByRole('radio', { name: /HTTP/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Daftarkan perangkat' }));
    expect(await within(dialog).findByText(/memerlukan kunci API/)).toBeInTheDocument();
    expect(state.created).toHaveLength(0);

    await user.click(within(dialog).getByRole('combobox', { name: 'Kunci API' }));
    await user.click(await screen.findByRole('option', { name: /Flow meter KM Bahari Nusantara/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Daftarkan perangkat' }));
    expect(
      await within(dialog).findByText('Kunci API ini sudah dipakai perangkat lain.'),
    ).toBeInTheDocument();
    expect(state.created[0]).toMatchObject({
      mmsi: 525005223,
      name: 'Flow meter AE',
      kind: 'http',
      apiKeyId: API_KEYS[0]!.id,
    });
  });

  it('tells the admin how to start without devices and shows errors with retry', async () => {
    mockDevices([]);
    const { unmount } = renderApp({ route: '/admin/devices', session: ADMIN });
    expect(await screen.findByText('Belum ada perangkat terdaftar', {}, APP)).toBeInTheDocument();
    unmount();
    server.use(
      http.get('*/api/v2/telemetry/devices', () => problem(500, 'INTERNAL_ERROR', 'Internal')),
    );
    renderApp({ route: '/admin/devices', session: ADMIN });
    expect(await screen.findByRole('button', { name: /Coba lagi/ }, APP)).toBeInTheDocument();
  });

  it('is forbidden for fleet managers', async () => {
    renderApp({ route: '/admin/devices', session: { roles: ['fleet_manager'] } });
    expect(await screen.findByText('Akses ditolak', {}, APP)).toBeInTheDocument();
  });
});
