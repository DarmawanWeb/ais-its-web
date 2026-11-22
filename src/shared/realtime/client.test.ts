import { http as mswHttp, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adoptTokenForTests, clearSession, sessionStore } from '@/shared/auth/session';
import { authMock } from '@/test/msw/auth-handlers';
import { server } from '@/test/msw/server';
import { makeAccessToken, TEST_IDS } from '@/test/tokens';

import { RealtimeClient } from './client';
import { useRealtimeConnectionStore } from './connection-store';

type Handler = (...args: unknown[]) => void;
interface SocketOptions {
  auth: (callback: (data: { token: string }) => void) => void;
}

/** The parts of a socket.io client socket the manager uses, driven by the test. */
class FakeSocket {
  connected = false;
  active = false;
  connectCalls = 0;
  disconnectCalls = 0;
  private readonly handlers = new Map<string, Set<Handler>>();
  readonly options: SocketOptions;

  constructor(options: SocketOptions) {
    this.options = options;
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  connect() {
    this.connectCalls += 1;
    this.active = true;
    return this;
  }
  disconnect() {
    this.disconnectCalls += 1;
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
    return this;
  }
  timeout() {
    return { emit: (..._args: unknown[]) => undefined };
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  /** The token the next handshake sends. */
  handshakeToken(): string {
    let token = '';
    this.options.auth((data) => (token = data.token));
    return token;
  }
  // Server side
  accept() {
    this.handshakeToken();
    this.connected = true;
    this.fire('connect');
  }
  dropConnection() {
    this.connected = false;
    this.active = true; // socket.io's manager reconnects transport failures by itself
    this.fire('disconnect', 'transport close');
  }
  rejectHandshake(code = 'UNAUTHORIZED') {
    this.handshakeToken();
    this.connected = false;
    this.active = false; // socket.io gives up after a middleware rejection
    this.fire('connect_error', Object.assign(new Error(code), { data: { code } }));
  }
}

const sockets: FakeSocket[] = [];

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    const options = args.find((arg) => typeof arg === 'object') as SocketOptions;
    const socket = new FakeSocket(options);
    sockets.push(socket);
    return socket;
  },
}));

function signIn(claims: Parameters<typeof makeAccessToken>[0] = {}) {
  adoptTokenForTests({ accessToken: makeAccessToken(claims), expiresIn: 900 });
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('RealtimeClient reconnection', () => {
  let client: RealtimeClient;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sockets.length = 0;
    client = new RealtimeClient();
  });

  afterEach(() => {
    client.stop();
    vi.useRealTimers();
  });

  it('comes back after a transient outage of the gateway and the auth service', async () => {
    signIn();
    client.start();
    const socket = sockets[0]!;
    socket.accept();
    expect(useRealtimeConnectionStore.getState().status).toBe('connected');

    // Outage: the reconnection handshake is rejected and POST /auth/refresh answers 503.
    server.use(
      mswHttp.post('*/api/v2/auth/refresh', () =>
        HttpResponse.json({ code: 'UNAVAILABLE', status: 503, title: 'Down' }, { status: 503 }),
      ),
    );
    socket.dropConnection();
    socket.rejectHandshake('UNAUTHORIZED');
    await flush();
    await vi.waitFor(() =>
      expect(useRealtimeConnectionStore.getState().status).toBe('reconnecting'),
    );
    expect(sessionStore.getState().status).toBe('authenticated'); // 5xx keeps the session

    // Services are healthy again: the socket retries by itself (backoff), no reload needed.
    server.resetHandlers();
    authMock.refreshValid = true;
    const callsBefore = socket.connectCalls;
    await vi.advanceTimersByTimeAsync(2_500);
    expect(socket.connectCalls).toBe(callsBefore + 1);
    socket.accept();
    expect(useRealtimeConnectionStore.getState().status).toBe('connected');
  });

  it('reconnects as soon as the session adopts a new token while the socket is down', async () => {
    signIn();
    client.start();
    const socket = sockets[0]!;
    socket.accept();
    server.use(
      mswHttp.post('*/api/v2/auth/refresh', () =>
        HttpResponse.json({ code: 'UNAVAILABLE', status: 503, title: 'Down' }, { status: 503 }),
      ),
    );
    socket.rejectHandshake('UNAUTHORIZED');
    await flush();
    const callsBefore = socket.connectCalls;
    // e.g. the session layer's own refresh retry succeeded, or another tab refreshed.
    signIn();
    expect(socket.connectCalls).toBe(callsBefore + 1);
    expect(socket.handshakeToken()).toBe(sessionStore.getState().accessToken);
  });

  it('refreshes the token once and reconnects after an expired-token rejection', async () => {
    signIn();
    client.start();
    const socket = sockets[0]!;
    authMock.refreshValid = true;
    const rejected = socket.handshakeToken();
    socket.rejectHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(socket.connectCalls).toBe(2));
    expect(authMock.refreshCalls).toBe(1);
    expect(socket.handshakeToken()).not.toBe(rejected);
  });

  it('re-handshakes when the user or the roles change within the same organization', () => {
    signIn({ roles: ['viewer'] });
    client.start();
    const socket = sockets[0]!;
    socket.accept();
    const { connectCalls, disconnectCalls } = socket;

    signIn({ roles: ['viewer'] }); // same identity, new token: keep the connection
    expect(socket.disconnectCalls).toBe(disconnectCalls);

    signIn({ roles: ['authority'] }); // the "authority" room depends on the roles
    expect(socket.disconnectCalls).toBe(disconnectCalls + 1);
    expect(socket.connectCalls).toBe(connectCalls + 1);

    socket.accept();
    signIn({ roles: ['authority'], sub: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6f' }); // another user
    expect(socket.disconnectCalls).toBe(disconnectCalls + 2);

    socket.accept();
    signIn({
      roles: ['authority'],
      sub: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6f',
      org: TEST_IDS.orgB,
    });
    expect(socket.disconnectCalls).toBe(disconnectCalls + 3);
  });

  it('reconnects after the server closed the connection', async () => {
    signIn();
    client.start();
    const socket = sockets[0]!;
    socket.accept();
    socket.connected = false;
    socket.active = false;
    socket.fire('disconnect', 'io server disconnect');
    const callsBefore = socket.connectCalls;
    await vi.advanceTimersByTimeAsync(2_500);
    expect(socket.connectCalls).toBe(callsBefore + 1);
  });

  it('stops retrying when the user signs out', async () => {
    signIn();
    client.start();
    const socket = sockets[0]!;
    server.use(
      mswHttp.post('*/api/v2/auth/refresh', () =>
        HttpResponse.json({ code: 'UNAVAILABLE', status: 503, title: 'Down' }, { status: 503 }),
      ),
    );
    socket.rejectHandshake('UNAUTHORIZED');
    await flush();
    clearSession('logout');
    const callsBefore = socket.connectCalls;
    await vi.advanceTimersByTimeAsync(70_000);
    expect(socket.connectCalls).toBe(callsBefore);
    expect(useRealtimeConnectionStore.getState().status).toBe('idle');
  });
});
