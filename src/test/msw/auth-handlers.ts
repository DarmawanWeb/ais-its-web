import type { Role } from '@darmawanweb/ais-its-contracts/auth';
import { delay, http, HttpResponse } from 'msw';

import { makeAccessToken, TEST_IDS } from '../tokens';

/**
 * In-memory auth service for tests (spec §13.1). Tests tweak `authMock` to simulate a valid
 * refresh cookie, MFA, throttling, or roles.
 */
export interface AuthMockState {
  /** The browser holds a valid refresh cookie (aisits_rt). */
  refreshValid: boolean;
  /** Number of POST /auth/refresh calls (single-flight assertions). */
  refreshCalls: number;
  roles: Role[];
  orgId: string | null;
  mfaEnabled: boolean;
  /** Seconds of Retry-After to answer 429 on login; null = no throttling. */
  throttleSeconds: number | null;
  password: string;
  email: string;
  refreshDelayMs: number;
}

export const DEFAULT_PASSWORD = 'Rahasia12345';

export const authMock: AuthMockState = {
  refreshValid: false,
  refreshCalls: 0,
  roles: ['fleet_manager'],
  orgId: TEST_IDS.orgA,
  mfaEnabled: false,
  throttleSeconds: null,
  password: DEFAULT_PASSWORD,
  email: 'nakhoda@pelni.test',
  refreshDelayMs: 0,
};

export function resetAuthMock(): void {
  Object.assign(authMock, {
    refreshValid: false,
    refreshCalls: 0,
    roles: ['fleet_manager'],
    orgId: TEST_IDS.orgA,
    mfaEnabled: false,
    throttleSeconds: null,
    password: DEFAULT_PASSWORD,
    email: 'nakhoda@pelni.test',
    refreshDelayMs: 0,
  } satisfies AuthMockState);
}

function problem(
  status: number,
  code: string,
  title: string,
  headers: Record<string, string> = {},
) {
  return HttpResponse.json(
    {
      type: `urn:ais-its:problem:${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      traceId: 'trace-test',
    },
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  );
}

const memberships = () => [
  { orgId: TEST_IDS.orgA, orgName: 'PT Pelayaran Nusantara', role: 'fleet_manager' },
  { orgId: TEST_IDS.orgB, orgName: 'Otoritas Pelabuhan Batam', role: 'authority' },
];

function tokens() {
  return {
    accessToken: makeAccessToken({
      roles: authMock.roles,
      org: authMock.orgId,
      email: authMock.email,
    }),
    expiresIn: 900,
  };
}

export const authHandlers = [
  http.post('*/api/v2/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (authMock.throttleSeconds !== null) {
      return problem(429, 'RATE_LIMITED', 'Too many requests', {
        'Retry-After': String(authMock.throttleSeconds),
      });
    }
    if (body.email !== authMock.email || body.password !== authMock.password) {
      return problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }
    if (authMock.mfaEnabled)
      return HttpResponse.json({ mfaRequired: true, mfaToken: 'mfa-token-1' });
    authMock.refreshValid = true;
    return HttpResponse.json({
      ...tokens(),
      user: { id: TEST_IDS.user, email: authMock.email, name: 'Rina Nakhoda' },
      memberships: memberships(),
      activeOrgId: authMock.orgId,
    });
  }),

  http.post('*/api/v2/auth/mfa/verify', async ({ request }) => {
    const body = (await request.json()) as { mfaToken?: string; code?: string };
    if (body.mfaToken !== 'mfa-token-1') return problem(400, 'INVALID_TOKEN', 'Invalid token');
    if (body.code !== '123456') return problem(401, 'INVALID_MFA_CODE', 'Invalid MFA code');
    authMock.refreshValid = true;
    return HttpResponse.json({
      ...tokens(),
      user: { id: TEST_IDS.user, email: authMock.email, name: 'Rina Nakhoda' },
      memberships: memberships(),
      activeOrgId: authMock.orgId,
    });
  }),

  http.post('*/api/v2/auth/refresh', async () => {
    authMock.refreshCalls += 1;
    if (authMock.refreshDelayMs > 0) await delay(authMock.refreshDelayMs);
    if (!authMock.refreshValid) return problem(401, 'UNAUTHORIZED', 'Unauthorized');
    return HttpResponse.json(tokens());
  }),

  http.post('*/api/v2/auth/logout', () => {
    authMock.refreshValid = false;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('*/api/v2/auth/switch-org', async ({ request }) => {
    const body = (await request.json()) as { orgId?: string };
    if (!body.orgId) return problem(400, 'VALIDATION_FAILED', 'Validation failed');
    authMock.orgId = body.orgId;
    return HttpResponse.json(tokens());
  }),

  http.post('*/api/v2/auth/password/forgot', () => new HttpResponse(null, { status: 202 })),

  http.post('*/api/v2/auth/password/reset', async ({ request }) => {
    const body = (await request.json()) as { token?: string };
    if (body.token !== 'reset-token') return problem(400, 'INVALID_TOKEN', 'Invalid token');
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/v2/me', () =>
    HttpResponse.json({
      id: TEST_IDS.user,
      email: authMock.email,
      name: 'Rina Nakhoda',
      mfaEnabled: authMock.mfaEnabled,
      memberships: memberships(),
    }),
  ),
];
