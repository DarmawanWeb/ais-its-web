import {
  AccessTokenClaimsSchema,
  parseRoles,
  type Role,
} from '@darmawanweb/ais-its-contracts/auth';

/** Claims of the access token the web app relies on (spec §8.2). */
export interface SessionClaims {
  /** User id. */
  readonly sub: string;
  /** Session id (refresh token family). */
  readonly sid: string | null;
  /** Active organization id; null for platform admins without one. */
  readonly org: string | null;
  readonly roles: readonly Role[];
  readonly email: string;
  readonly name: string;
  /** Expiry, seconds since epoch. */
  readonly exp: number;
  readonly iat: number;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decodes (does NOT verify) the payload of a JWT. Services verify; the UI only reads. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(base64UrlDecode(parts[1]));
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the claims of an access token. Uses the contracts schema and falls back to a lenient
 * read (unknown shapes from a newer auth service must not lock users out of the UI; the API
 * still enforces everything).
 */
export function parseAccessToken(token: string): SessionClaims | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const strict = AccessTokenClaimsSchema.safeParse(payload);
  if (strict.success) {
    const c = strict.data;
    return {
      sub: c.sub,
      sid: c.sid,
      org: c.org,
      roles: c.roles,
      email: c.email,
      name: c.name,
      exp: c.exp,
      iat: c.iat,
    };
  }
  const { sub, sid, org, roles, email, name, exp, iat } = payload;
  if (typeof sub !== 'string' || typeof exp !== 'number') return null;
  return {
    sub,
    sid: typeof sid === 'string' ? sid : null,
    org: typeof org === 'string' ? org : null,
    roles: Array.isArray(roles) ? parseRoles(roles) : [],
    email: typeof email === 'string' ? email : '',
    name: typeof name === 'string' ? name : '',
    exp,
    iat: typeof iat === 'number' ? iat : Math.floor(Date.now() / 1000),
  };
}
