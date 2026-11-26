// Auth service mock for the profile feature (spec §13.1, services/auth/README.md): the signed-in
// profile (`GET /me` replaces the base default, `PATCH /me`), the password change (current
// password check, policy of ≥ 10 characters with a letter and a digit, other sessions revoked),
// TOTP MFA (setup → enable / disable with a real RFC 6238 code, ±1 step, SHA-1, 6 digits) and
// the session list (this session from the token's `sid`, plus two demo sessions on other
// devices) with revocation. Passwords of the demo accounts never change (the login core reads
// them); state is per account and restored by `reset()`.
import { createHmac, randomBytes } from 'node:crypto';

import { permissionsForRoles, parseRoles } from '@darmawanweb/ais-its-contracts/auth';

import { DEMO_CREATED_AT, membershipsOf, MockHttpError, pageOf } from '../lib.mjs';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// --- TOTP (RFC 6238 over RFC 4226) ------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function codeIsValid(secret, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((delta) => totp(secret, step + delta) === code);
}

// --- per-account state ----------------------------------------------------------------------

/** userId → { name, mfaEnabled, secret, pending, sessions } */
let accounts = new Map();

function demoSessions(user) {
  const suffix = user.id.slice(-4);
  return [
    {
      id: `0192f0c8-7d3a-7c2e-9a1d-000000${suffix}01`,
      orgId: user.memberships[0]?.orgId ?? null,
      createdAt: ago(4 * DAY),
      lastUsedAt: ago(5 * HOUR),
      ip: '36.84.12.7',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    },
    {
      id: `0192f0c8-7d3a-7c2e-9a1d-000000${suffix}02`,
      orgId: user.memberships.at(-1)?.orgId ?? null,
      createdAt: ago(9 * DAY),
      lastUsedAt: ago(2 * DAY),
      ip: '103.47.132.9',
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    },
  ];
}

function accountOf(user) {
  let account = accounts.get(user.id);
  if (!account) {
    account = {
      name: user.name,
      mfaEnabled: false,
      secret: null,
      pending: null,
      sessions: demoSessions(user),
      revoked: new Set(),
    };
    accounts.set(user.id, account);
  }
  return account;
}

function requireUser(user) {
  if (!user) throw new MockHttpError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}

function userDto(user, account) {
  return {
    id: user.id,
    email: user.email,
    name: account.name,
    status: 'active',
    mfaEnabled: account.mfaEnabled,
    isPlatformAdmin: user.platformAdmin,
    lastLoginAt: ago(20 * MINUTE),
    createdAt: DEMO_CREATED_AT,
    updatedAt: DEMO_CREATED_AT,
  };
}

function passwordViolations(password) {
  const value = typeof password === 'string' ? password : '';
  const length = [...value].length;
  const violations = [];
  if (length < 10) violations.push(['too_short', 'must be at least 10 characters long']);
  if (length > 128) violations.push(['too_long', 'must be at most 128 characters long']);
  if (!/\p{L}/u.test(value))
    violations.push(['missing_letter', 'must contain at least one letter']);
  if (!/\p{Nd}/u.test(value)) violations.push(['missing_digit', 'must contain at least one digit']);
  return violations.map(([code, message]) => ({
    field: 'newPassword',
    message: `newPassword ${message}`,
    code: `password_${code}`,
  }));
}

const invalidCode = () =>
  new MockHttpError(401, 'INVALID_MFA_CODE', 'Invalid MFA code', {
    detail: 'The code is invalid or was already used',
  });

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/me',
    handler: ({ claims, user, send }) => {
      const account = accountOf(requireUser(user));
      const roles = claims.roles ?? [];
      send(200, {
        ...userDto(user, account),
        memberships: membershipsOf(user),
        activeOrgId: claims.org ?? null,
        roles,
        permissions: [...permissionsForRoles(parseRoles(roles))].sort(),
      });
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/me',
    handler: async ({ user, body, send }) => {
      const account = accountOf(requireUser(user));
      const { name } = await body();
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed || trimmed.length > 200) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [{ field: 'name', message: 'name must be 1 to 200 characters long' }],
        });
      }
      account.name = trimmed;
      send(200, userDto(user, account));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/auth/password/change',
    handler: async ({ claims, user, body, send }) => {
      const account = accountOf(requireUser(user));
      const { currentPassword, newPassword } = await body();
      if (currentPassword !== user.password) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: [
            {
              field: 'currentPassword',
              message: 'The current password is incorrect',
              code: 'password_mismatch',
            },
          ],
        });
      }
      const violations = passwordViolations(newPassword);
      if (violations.length > 0) {
        throw new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', {
          errors: violations,
        });
      }
      // The other sessions end (spec §13.1); this one stays.
      for (const session of account.sessions)
        if (session.id !== claims.sid) account.revoked.add(session.id);
      send(204);
    },
  },
  {
    method: 'POST',
    path: '/api/v2/auth/mfa/setup',
    handler: ({ user, send }) => {
      const account = accountOf(requireUser(user));
      if (account.mfaEnabled)
        throw new MockHttpError(409, 'MFA_ALREADY_ENABLED', 'MFA already enabled');
      account.pending = base32Encode(randomBytes(20));
      const label = encodeURIComponent(`AIS Maritime Intelligence:${user.email}`);
      send(200, {
        secret: account.pending,
        otpauthUrl: `otpauth://totp/${label}?secret=${account.pending}&issuer=${encodeURIComponent('AIS Maritime Intelligence')}&algorithm=SHA1&digits=6&period=30`,
      });
    },
  },
  {
    method: 'POST',
    path: '/api/v2/auth/mfa/enable',
    handler: async ({ user, body, send }) => {
      const account = accountOf(requireUser(user));
      if (account.mfaEnabled)
        throw new MockHttpError(409, 'MFA_ALREADY_ENABLED', 'MFA already enabled');
      if (!account.pending)
        throw new MockHttpError(409, 'MFA_SETUP_REQUIRED', 'MFA setup required');
      const { code } = await body();
      if (!codeIsValid(account.pending, code)) throw invalidCode();
      account.secret = account.pending;
      account.pending = null;
      account.mfaEnabled = true;
      send(204);
    },
  },
  {
    method: 'POST',
    path: '/api/v2/auth/mfa/disable',
    handler: async ({ user, body, send }) => {
      const account = accountOf(requireUser(user));
      if (!account.mfaEnabled) throw new MockHttpError(409, 'MFA_NOT_ENABLED', 'MFA not enabled');
      const { code } = await body();
      if (!codeIsValid(account.secret, code)) throw invalidCode();
      account.mfaEnabled = false;
      account.secret = null;
      send(204);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/auth/sessions',
    handler: ({ req, claims, user, url, send }) => {
      const account = accountOf(requireUser(user));
      const issuedAt = typeof claims.iat === 'number' ? claims.iat * 1000 : Date.now();
      const current = {
        id: claims.sid,
        orgId: claims.org ?? null,
        createdAt: new Date(issuedAt - 2 * MINUTE).toISOString(),
        lastUsedAt: new Date().toISOString(),
        ip: '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? null,
        current: true,
      };
      const others = account.sessions
        .filter((session) => !account.revoked.has(session.id) && session.id !== claims.sid)
        .map((session) => ({ ...session, current: false }));
      send(200, pageOf([current, ...others], url));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/auth/sessions/:id',
    handler: ({ claims, user, params, send }) => {
      const account = accountOf(requireUser(user));
      const known =
        params.id === claims.sid ||
        account.sessions.some(
          (session) => session.id === params.id && !account.revoked.has(session.id),
        );
      if (!known) throw new MockHttpError(404, 'SESSION_NOT_FOUND', 'Session not found');
      account.revoked.add(params.id);
      send(204);
    },
  },
];

export function reset() {
  accounts = new Map();
}
