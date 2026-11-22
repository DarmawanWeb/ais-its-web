import { describe, expect, it } from 'vitest';

import type {
  AccessTokenDto,
  LoginResponseDto,
  MeDto,
  MfaChallengeDto,
  SessionDto,
  SwitchOrganizationResponseDto,
} from '@/shared/api/generated/auth/model';
import { makeAccessToken, TEST_IDS } from '@/test/tokens';

import {
  AuthSessionSchema,
  LoginSuccessSchema,
  MeSchema,
  MfaChallengeSchema,
  normalizeMemberships,
  TokenResponseSchema,
} from './auth-api';

/*
 * The session layer keeps a hand-written, zod-validated client of the auth endpoints. These
 * fixtures are typed with the DTOs generated from the auth service's openapi.json: when the
 * contract changes, `pnpm api:generate` + `pnpm typecheck` fail here before users do.
 */
const user = {
  id: TEST_IDS.user,
  email: 'nakhoda@pelni.test',
  name: 'Rina Nakhoda',
  status: 'active',
  mfaEnabled: false,
  isPlatformAdmin: false,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
} satisfies LoginResponseDto['user'];

const membership = {
  orgId: TEST_IDS.orgA,
  orgName: 'PT Pelayaran Nusantara',
  orgSlug: 'pelni',
  orgKind: 'shipping_company',
  role: 'fleet_manager',
  joinedAt: '2026-11-01T00:00:00.000Z',
} satisfies MeDto['memberships'][number];

describe('auth API schemas match the published auth contract', () => {
  it('parses the login response', () => {
    const response: LoginResponseDto = {
      accessToken: makeAccessToken(),
      expiresIn: 900,
      user,
      memberships: [membership],
      activeOrgId: TEST_IDS.orgA,
    };
    const parsed = LoginSuccessSchema.parse(response);
    expect(parsed.user?.email).toBe(user.email);
    expect(normalizeMemberships(parsed.memberships)).toEqual([
      {
        orgId: TEST_IDS.orgA,
        orgName: 'PT Pelayaran Nusantara',
        orgSlug: 'pelni',
        orgKind: 'shipping_company',
        role: 'fleet_manager',
      },
    ]);
  });

  it('parses the MFA challenge, refresh and org switch responses', () => {
    const challenge: MfaChallengeDto = { mfaRequired: true, mfaToken: 'mfa-token-1' };
    expect(MfaChallengeSchema.parse(challenge).mfaToken).toBe('mfa-token-1');
    const refreshed: AccessTokenDto = { accessToken: makeAccessToken(), expiresIn: 900 };
    expect(TokenResponseSchema.parse(refreshed).expiresIn).toBe(900);
    const switched: SwitchOrganizationResponseDto = {
      accessToken: makeAccessToken({ org: TEST_IDS.orgB }),
      expiresIn: 900,
      activeOrgId: TEST_IDS.orgB,
    };
    expect(TokenResponseSchema.parse(switched).accessToken).toBe(switched.accessToken);
  });

  it('parses GET /me with its memberships', () => {
    const me: MeDto = {
      ...user,
      memberships: [membership],
      activeOrgId: TEST_IDS.orgA,
      roles: ['fleet_manager'],
      permissions: ['vessel:read'],
    };
    const parsed = MeSchema.parse(me);
    expect(parsed.name).toBe('Rina Nakhoda');
    expect(normalizeMemberships(parsed.memberships)[0]?.orgName).toBe('PT Pelayaran Nusantara');
  });

  it('parses the session list entries', () => {
    const session: SessionDto = {
      id: TEST_IDS.session,
      orgId: TEST_IDS.orgA,
      createdAt: '2026-11-01T00:00:00.000Z',
      lastUsedAt: '2026-11-02T00:00:00.000Z',
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0',
      current: true,
    };
    expect(AuthSessionSchema.parse(session).current).toBe(true);
  });
});
