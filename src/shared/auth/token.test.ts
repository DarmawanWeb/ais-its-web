import { describe, expect, it } from 'vitest';

import { makeAccessToken, TEST_IDS } from '@/test/tokens';

import { decodeJwtPayload, parseAccessToken } from './token';

describe('access token claims', () => {
  it('reads the claims of spec §8.2', () => {
    const claims = parseAccessToken(
      makeAccessToken({ roles: ['authority', 'viewer'], org: TEST_IDS.orgB }),
    );
    expect(claims).toMatchObject({
      sub: TEST_IDS.user,
      sid: TEST_IDS.session,
      org: TEST_IDS.orgB,
      roles: ['authority', 'viewer'],
      email: 'nakhoda@pelni.test',
      name: 'Rina Nakhoda',
    });
    expect(claims?.exp).toBeGreaterThan(claims?.iat ?? 0);
  });

  it('drops unknown roles and accepts a null organization', () => {
    const token = makeAccessToken({ roles: ['super_admin', 'captain' as never], org: null });
    expect(parseAccessToken(token)).toMatchObject({ roles: ['super_admin'], org: null });
  });

  it('returns null for malformed tokens', () => {
    expect(parseAccessToken('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.%%%.c')).toBeNull();
  });
});
