import type { Role } from '@darmawanweb/ais-its-contracts/auth';

/** Ids used by the fixtures (valid UUIDs, as the contracts schema requires). */
export const TEST_IDS = {
  user: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a',
  session: '0192f0c8-7d3a-7c2e-9a1b-aaaaaaaaaaaa',
  orgA: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
  orgB: '0192f0c8-7d3a-7c2e-9a1b-000000000002',
} as const;

export interface TestClaims {
  sub?: string;
  sid?: string;
  org?: string | null;
  roles?: Role[];
  email?: string;
  name?: string;
  ttlSeconds?: number;
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let counter = 0;

/** An unsigned access token with the claims of spec §8.2 (the UI never verifies signatures). */
export function makeAccessToken(claims: TestClaims = {}): string {
  const now = Math.floor(Date.now() / 1000);
  counter += 1;
  const payload = {
    iss: 'ais-its-auth',
    aud: 'ais-its-api',
    sub: claims.sub ?? TEST_IDS.user,
    sid: claims.sid ?? TEST_IDS.session,
    org: claims.org === undefined ? TEST_IDS.orgA : claims.org,
    roles: claims.roles ?? ['fleet_manager'],
    email: claims.email ?? 'nakhoda@pelni.test',
    name: claims.name ?? 'Rina Nakhoda',
    typ: 'access',
    iat: now,
    exp: now + (claims.ttlSeconds ?? 900),
    jti: counter,
  };
  return `${base64Url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'test' }))}.${base64Url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
}
