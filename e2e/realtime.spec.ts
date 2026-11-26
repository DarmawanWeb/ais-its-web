import type {
  RealtimeAlert,
  RealtimeClientToServerEvents,
  RealtimePosition,
  RealtimeServerToClientEvents,
} from '@darmawanweb/ais-its-contracts/realtime';
import { expect, test } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

import {
  expectRealtimeConnected,
  login,
  MOCK_GATEWAY_URL,
  pushRealtime,
  USERS,
  waitForRealtimeRoom,
} from './fixtures';

type RealtimeSocket = Socket<RealtimeServerToClientEvents, RealtimeClientToServerEvents>;

/** A vessel that is not in the REST seed, inside the default map view (Batam). */
const position = (): RealtimePosition => ({
  mmsi: 525099001,
  time: new Date().toISOString(),
  lat: 1.143,
  lon: 103.857,
  sog: 6.2,
  cog: 90,
  hdg: 90,
  navstatus: 0,
  predictedNavstatus: 0,
  source: 'primary',
});

const ALERT: RealtimeAlert = {
  id: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e01',
  type: 'ews',
  domain: 'safety',
  severity: 'critical',
  status: 'open',
  mmsi: 525005223,
  relatedMmsi: null,
  title: 'Bahaya EWS',
  message: 'KM Bahari Nusantara 95 m dari pipa gas',
  lat: 1.152,
  lon: 103.902,
  zoneId: null,
  methodId: 'ews.pipeline_distance_status',
  occurredAt: new Date().toISOString(),
  lastOccurredAt: new Date().toISOString(),
  occurrences: 1,
  data: {},
};

async function accessToken(user: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${MOCK_GATEWAY_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function connect(token: string): RealtimeSocket {
  return io(MOCK_GATEWAY_URL, {
    path: '/ws',
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

test.describe('realtime (mock socket.io server, spec §9)', () => {
  test('handshake, viewport rooms, batches and alerts follow the protocol', async () => {
    const socket = connect(await accessToken(USERS.manager));
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      expect(
        await socket
          .timeout(5_000)
          .emitWithAck('viewport:set', { bbox: [103.6, 0.95, 104.1, 1.35], zoom: 11 }),
      ).toEqual({ ok: true, data: { mode: 'tiles', tileCount: 1 } });
      expect(
        await socket
          .timeout(5_000)
          .emitWithAck('viewport:set', { bbox: [104, 1, 103, 2], zoom: 9 }),
      ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

      const pushed = position();
      const batch = new Promise<unknown>((resolve) => {
        socket.on('positions', (received) => {
          if (received.items.some((item) => item.mmsi === pushed.mmsi)) resolve(received);
        });
      });
      await pushRealtime({ kind: 'positions', items: [pushed] });
      expect(await batch).toMatchObject({ items: [pushed] });

      // vessel:subscribe answers with the latest known position of the vessel.
      const snapshot = new Promise<RealtimePosition>((resolve) => {
        socket.once('vessel:position', resolve);
      });
      expect(
        await socket.timeout(5_000).emitWithAck('vessel:subscribe', { mmsi: pushed.mmsi }),
      ).toEqual({ ok: true, data: { mmsi: pushed.mmsi } });
      expect(await snapshot).toMatchObject({ mmsi: pushed.mmsi, lat: pushed.lat });

      // Alerts go to `authority` and the organization owning the vessel (the manager's).
      const alert = new Promise<RealtimeAlert>((resolve) => socket.once('alert:raised', resolve));
      await pushRealtime({ kind: 'alert', alert: ALERT });
      expect(await alert).toMatchObject({ id: ALERT.id, severity: 'critical' });

      // Payloads are validated with the contracts schemas.
      await expect(
        pushRealtime({ kind: 'positions', items: [{ ...pushed, mmsi: 1 }] }),
      ).rejects.toThrow(/400 .*VALIDATION_FAILED/);
    } finally {
      socket.close();
    }

    const rejected = connect('not-a-token');
    try {
      const error = await new Promise<Error & { data?: unknown }>((resolve) => {
        rejected.once('connect_error', resolve);
      });
      expect(error.data).toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      rejected.close();
    }
  });

  test('the app connects and the live map shows pushed positions', async ({ page }) => {
    await login(page, USERS.manager);
    await expectRealtimeConnected(page);

    await page.goto('/map');
    const count = page.getByTestId('vessel-count');
    await expect(count).not.toHaveText('0');
    const before = Number(await count.textContent());
    await waitForRealtimeRoom(/^tile:/);

    // Pushed until the map's socket (rooms joined after its viewport) receives it.
    await expect
      .poll(
        async () => {
          await pushRealtime({ kind: 'positions', items: [position()] });
          return Number(await count.textContent());
        },
        { timeout: 15_000 },
      )
      .toBe(before + 1);
  });
});
