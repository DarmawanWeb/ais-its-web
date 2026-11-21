import { http as mswHttp, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { http } from '@/shared/api/http';
import { authMock, DEFAULT_PASSWORD } from '@/test/msw/auth-handlers';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

import {
  bootstrapSession,
  getAccessToken,
  initSession,
  login,
  logout,
  refreshAccessToken,
  sessionStore,
  switchOrganization,
  verifyMfa,
} from './session';

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
