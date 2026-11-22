import { delay, http as mswHttp, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { http } from '@/shared/api/http';
import { authMock, DEFAULT_PASSWORD } from '@/test/msw/auth-handlers';
import { server } from '@/test/msw/server';
import { makeAccessToken, TEST_IDS } from '@/test/tokens';

import {
  adoptTokenForTests,
  bootstrapSession,
  getAccessToken,
  initSession,
  login,
  LOGOUT_PENDING_KEY,
  logout,
  receiveBroadcastForTests,
  refreshAccessToken,
  resetSessionForTests,
  retryPendingLogout,
  sessionStore,
  switchOrganization,
  tokenLifetimeMs,
  verifyMfa,
} from './session';
import { parseAccessToken } from './token';

initSession();

describe('session bootstrap', () => {
  it('restores the session from the refresh cookie', async () => {
    authMock.refreshValid = true;
    authMock.roles = ['org_admin'];
    await bootstrapSession();
    const state = sessionStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.claims).toMatchObject({
      sub: TEST_IDS.user,
      org: TEST_IDS.orgA,
      roles: ['org_admin'],
    });
    expect(state.accessToken).toBe(getAccessToken());
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it('ends as unauthenticated without a valid refresh cookie', async () => {
    await bootstrapSession();
    expect(sessionStore.getState().status).toBe('unauthenticated');
    expect(getAccessToken()).toBeNull();
  });
});

describe('single-flight refresh', () => {
  it('shares one request between concurrent callers', async () => {
    authMock.refreshValid = true;
    authMock.refreshDelayMs = 30;
    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);
    expect(authMock.refreshCalls).toBe(1);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBeTruthy();
  });

  it('retries a request once with the new token after a 401', async () => {
    authMock.refreshValid = true;
    await refreshAccessToken();
    const firstToken = getAccessToken();
    const seen: string[] = [];
    server.use(
      mswHttp.get('*/api/v2/vessels', ({ request }) => {
        const auth = request.headers.get('authorization') ?? '';
        seen.push(auth);
        return auth === `Bearer ${firstToken}`
          ? HttpResponse.json(
              { code: 'UNAUTHORIZED', title: 'Unauthorized', status: 401, type: 'about:blank' },
              { status: 401 },
            )
          : HttpResponse.json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      }),
    );
    const response = await http.get('/api/v2/vessels');
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(`Bearer ${getAccessToken()}`);
    expect(getAccessToken()).not.toBe(firstToken);
    expect(seen.every((header) => header.startsWith('Bearer '))).toBe(true);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    authMock.refreshValid = true;
    await refreshAccessToken();
    authMock.refreshValid = false;
    server.use(
      mswHttp.get('*/api/v2/vessels', () =>
        HttpResponse.json(
          { code: 'UNAUTHORIZED', title: 'Unauthorized', status: 401, type: 'about:blank' },
          { status: 401 },
        ),
      ),
    );
    await expect(http.get('/api/v2/vessels')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(sessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      endReason: 'expired',
    });
  });

  it('sends X-Request-Id on every request', async () => {
    let requestId: string | null = null;
    server.use(
      mswHttp.get('*/api/v2/ping', ({ request }) => {
        requestId = request.headers.get('x-request-id');
        return HttpResponse.json({ ok: true });
      }),
    );
    await http.get('/api/v2/ping');
    expect(requestId).toMatch(/^[0-9a-f-]{20,}$/);
  });
});

describe('login, MFA, org switch and logout', () => {
  it('logs in with e-mail and password', async () => {
    const outcome = await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    expect(outcome).toEqual({ status: 'authenticated' });
    const state = sessionStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.memberships.map((m) => m.orgName)).toContain('PT Pelayaran Nusantara');
    expect(state.user?.name).toBe('Rina Nakhoda');
  });

  it('rejects wrong credentials with the problem code', async () => {
    await expect(login('nakhoda@pelni.test', 'wrong-password1')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessionStore.getState().status).not.toBe('authenticated');
  });

  it('asks for the TOTP code when MFA is enabled', async () => {
    authMock.mfaEnabled = true;
    const outcome = await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    expect(outcome).toEqual({ status: 'mfa', mfaToken: 'mfa-token-1' });
    await expect(verifyMfa('mfa-token-1', '000000')).rejects.toMatchObject({
      code: 'INVALID_MFA_CODE',
    });
    await verifyMfa('mfa-token-1', '123456');
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('switches the active organization', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    const claims = await switchOrganization(TEST_IDS.orgB);
    expect(claims.org).toBe(TEST_IDS.orgB);
    expect(sessionStore.getState().claims?.org).toBe(TEST_IDS.orgB);
  });

  it('logs out and clears the in-memory token', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    await logout();
    expect(sessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      accessToken: null,
      endReason: 'logout',
    });
    expect(authMock.refreshValid).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
});

/** Counts calls to an auth endpoint and lets a test make it fail. */
function trackLogout(status = 204) {
  const calls = { logout: 0 };
  server.use(
    mswHttp.post('*/api/v2/auth/logout', () => {
      calls.logout += 1;
      if (status === 204) authMock.refreshValid = false;
      return status === 204
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ code: 'UNAVAILABLE', status, title: 'Unavailable' }, { status });
    }),
  );
  return calls;
}

describe('sign-out that does not reach the server', () => {
  afterEach(() => vi.useRealTimers());

  it('reports it, keeps a marker and never restores the session from the cookie', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    const calls = trackLogout(503);
    const result = await logout();
    expect(result).toEqual({ revoked: false });
    expect(calls.logout).toBe(2); // first attempt + one immediate retry
    expect(sessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      endReason: 'logout',
      logoutPending: true,
    });
    const marker = window.localStorage.getItem(LOGOUT_PENDING_KEY);
    expect(marker).toBeTruthy();
    expect(marker).not.toContain('eyJ'); // never a token
    expect(authMock.refreshValid).toBe(true); // the server still has the family

    // Next page load: /auth/logout instead of /auth/refresh, the session stays signed out.
    resetSessionForTests();
    const refreshesBefore = authMock.refreshCalls;
    await bootstrapSession();
    expect(authMock.refreshCalls).toBe(refreshesBefore);
    expect(calls.logout).toBe(4);
    expect(sessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      logoutPending: true,
    });

    // The service is back: the retry revokes the family and clears the marker.
    const recovered = trackLogout(204);
    await expect(retryPendingLogout()).resolves.toBe(true);
    expect(recovered.logout).toBe(1);
    expect(authMock.refreshValid).toBe(false);
    expect(window.localStorage.getItem(LOGOUT_PENDING_KEY)).toBeNull();
    expect(sessionStore.getState().logoutPending).toBe(false);
  });

  it('retries in the background until the sign-out succeeds', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    trackLogout(503);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await logout();
    const recovered = trackLogout(204);
    await vi.advanceTimersByTimeAsync(5_500);
    await vi.waitFor(() => expect(recovered.logout).toBe(1));
    expect(window.localStorage.getItem(LOGOUT_PENDING_KEY)).toBeNull();
    expect(sessionStore.getState().logoutPending).toBe(false);
  });

  it('does not refresh while a sign-out is pending (another tab signed out)', async () => {
    authMock.refreshValid = true;
    await bootstrapSession();
    expect(sessionStore.getState().status).toBe('authenticated');
    window.localStorage.setItem(LOGOUT_PENDING_KEY, JSON.stringify({ id: 'other-tab', at: 1 }));
    const calls = trackLogout(204);
    const refreshesBefore = authMock.refreshCalls;
    await expect(refreshAccessToken(getAccessToken())).resolves.toBeNull();
    expect(authMock.refreshCalls).toBe(refreshesBefore);
    expect(calls.logout).toBe(1);
    expect(sessionStore.getState().status).toBe('unauthenticated');
  });

  it('a new login replaces the cookie and clears the marker', async () => {
    window.localStorage.setItem(LOGOUT_PENDING_KEY, JSON.stringify({ id: 'old', at: 1 }));
    trackLogout(503);
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    expect(window.localStorage.getItem(LOGOUT_PENDING_KEY)).toBeNull();
    expect(sessionStore.getState()).toMatchObject({
      status: 'authenticated',
      logoutPending: false,
    });
  });
});

describe('refresh racing a sign-out', () => {
  it('drops a refresh that completes after the sign-out', async () => {
    authMock.refreshValid = true;
    await bootstrapSession();
    authMock.refreshDelayMs = 150;
    const posted: unknown[] = [];
    const postMessage = vi.spyOn(BroadcastChannel.prototype, 'postMessage');
    postMessage.mockImplementation((message: unknown) => void posted.push(message));
    const inFlight = refreshAccessToken(getAccessToken());
    await delay(20);
    const signedOut = logout();
    await expect(inFlight).resolves.toBeNull();
    await expect(signedOut).resolves.toEqual({ revoked: true });
    await delay(200);
    expect(sessionStore.getState()).toMatchObject({ status: 'unauthenticated', accessToken: null });
    expect(posted).toEqual([{ type: 'logout' }]); // no token broadcast after the sign-out
  });

  it('ignores tokens of other tabs that were minted before the sign-out', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    await logout();
    const accessToken = makeAccessToken();
    receiveBroadcastForTests({
      type: 'token',
      source: 'refresh',
      accessToken,
      expiresAt: Date.now() + 900_000,
      expiresIn: 900,
    });
    expect(sessionStore.getState().status).toBe('unauthenticated');
    // A new login in another tab is followed.
    receiveBroadcastForTests({
      type: 'token',
      source: 'login',
      accessToken,
      expiresAt: Date.now() + 900_000,
      expiresIn: 900,
    });
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated', accessToken });
  });

  it('ignores every token while a sign-out is pending', () => {
    window.localStorage.setItem(LOGOUT_PENDING_KEY, JSON.stringify({ id: 'x', at: 1 }));
    resetSessionForTests({ status: 'unauthenticated' });
    receiveBroadcastForTests({
      type: 'token',
      source: 'login',
      accessToken: makeAccessToken(),
      expiresAt: Date.now() + 900_000,
      expiresIn: 900,
    });
    expect(sessionStore.getState().status).toBe('unauthenticated');
  });

  it('signs out when another tab signs out', async () => {
    await login('nakhoda@pelni.test', DEFAULT_PASSWORD);
    receiveBroadcastForTests({ type: 'logout' });
    expect(sessionStore.getState()).toMatchObject({
      status: 'unauthenticated',
      endReason: 'logout',
    });
  });
});

describe('token expiry with a skewed client clock', () => {
  afterEach(() => vi.useRealTimers());

  it('derives the expiry from expiresIn, never from exp against the local clock', () => {
    const serverNow = Date.now() - 20 * 60_000; // the client clock runs 20 min ahead
    vi.useFakeTimers({ now: serverNow });
    const accessToken = makeAccessToken({ ttlSeconds: 900 }); // iat/exp on the server clock
    vi.useRealTimers();
    const claims = parseAccessToken(accessToken);
    expect(claims).not.toBeNull();
    expect(tokenLifetimeMs({ accessToken, expiresIn: 900 }, claims!)).toBe(900_000);
    const before = Date.now();
    adoptTokenForTests({ accessToken, expiresIn: 900 });
    const { expiresAt } = sessionStore.getState();
    expect(expiresAt! - before).toBeGreaterThanOrEqual(899_000);
    expect(expiresAt! - before).toBeLessThanOrEqual(901_000);
  });

  it('does not refresh in a loop when the clock is ahead', async () => {
    vi.useFakeTimers({ now: Date.now() - 20 * 60_000 });
    const accessToken = makeAccessToken({ ttlSeconds: 900 });
    vi.setSystemTime(Date.now() + 20 * 60_000);
    authMock.refreshValid = true;
    adoptTokenForTests({ accessToken, expiresIn: 900 });
    const before = authMock.refreshCalls;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(authMock.refreshCalls).toBe(before);
    // The scheduled refresh happens one minute before the 15-minute lifetime ends.
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(authMock.refreshCalls).toBe(before + 1);
  });
});
