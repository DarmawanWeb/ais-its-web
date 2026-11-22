import * as z from 'zod';

import { http } from '@/shared/api/http';
import { ApiProblem } from '@/shared/api/problem';
import { appConfig } from '@/shared/config/env';
import { createRequestId } from '@/shared/lib/utils';

/**
 * Hand-written client of the session endpoints (spec §13.1, stable) used by the session layer:
 * it needs per-request control (no token, no refresh-on-401, keepalive) and validates every
 * response with zod. The shapes match the auth service's openapi.json (auth-api.test.ts parses
 * fixtures typed with the generated DTOs, so a contract change fails the typecheck). Everything
 * else of the auth service (users, organizations, members, API keys, audit logs, sessions UI)
 * uses the generated client in src/shared/api/generated/auth.
 */
const BASE = '/api/v2/auth';
const LOGOUT_TIMEOUT_MS = 10_000;

/** Absolute URL of an API path, as axios builds it from the base URL. */
function apiUrl(path: string): string {
  const base = appConfig.apiBaseUrl.replace(/\/+$/, '');
  return new URL(`${base}${path}`, window.location.origin).toString();
}

export const AuthUserSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  name: z.string().nullish(),
  mfaEnabled: z.boolean().optional(),
  isPlatformAdmin: z.boolean().optional(),
  status: z.string().optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

const RawMembershipSchema = z.looseObject({
  orgId: z.string().optional(),
  organizationId: z.string().optional(),
  role: z.string(),
  orgName: z.string().optional(),
  orgSlug: z.string().optional(),
  orgKind: z.string().optional(),
  organization: z
    .looseObject({
      id: z.string(),
      name: z.string(),
      slug: z.string().optional(),
      kind: z.string().optional(),
    })
    .optional(),
});

/** A membership of the user in an organization (normalized). */
export interface Membership {
  readonly orgId: string;
  readonly orgName: string;
  readonly orgSlug: string | null;
  readonly orgKind: string | null;
  readonly role: string;
}

export function normalizeMemberships(value: unknown): Membership[] {
  const parsed = z.array(RawMembershipSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.flatMap((raw) => {
    const orgId = raw.orgId ?? raw.organizationId ?? raw.organization?.id;
    if (!orgId) return [];
    return [
      {
        orgId,
        orgName: raw.orgName ?? raw.organization?.name ?? orgId,
        orgSlug: raw.orgSlug ?? raw.organization?.slug ?? null,
        orgKind: raw.orgKind ?? raw.organization?.kind ?? null,
        role: raw.role,
      },
    ];
  });
}

export const TokenResponseSchema = z.looseObject({
  accessToken: z.string().min(10),
  expiresIn: z.number().positive(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const LoginSuccessSchema = TokenResponseSchema.extend({
  user: AuthUserSchema.optional(),
  memberships: z.unknown().optional(),
  activeOrgId: z.string().nullish(),
});
export type LoginSuccess = z.infer<typeof LoginSuccessSchema>;

export const MfaChallengeSchema = z.looseObject({
  mfaRequired: z.literal(true),
  mfaToken: z.string().min(1),
});
export type MfaChallenge = z.infer<typeof MfaChallengeSchema>;

export function isMfaChallenge(value: LoginSuccess | MfaChallenge): value is MfaChallenge {
  return value.mfaRequired === true && typeof value.mfaToken === 'string';
}

export const MeSchema = AuthUserSchema.extend({ memberships: z.unknown().optional() });

export interface Me extends AuthUser {
  readonly memberships: Membership[];
}

export const MfaSetupSchema = z.looseObject({ secret: z.string(), otpauthUrl: z.string() });
export type MfaSetup = z.infer<typeof MfaSetupSchema>;

export const AuthSessionSchema = z.looseObject({
  id: z.string(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().nullish(),
  ip: z.string().nullish(),
  userAgent: z.string().nullish(),
  current: z.boolean().optional(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

const publicConfig = { skipAuth: true, skipAuthRefresh: true } as const;

export const authApi = {
  async login(body: { email: string; password: string }): Promise<LoginSuccess | MfaChallenge> {
    const { data } = await http.post<unknown>(`${BASE}/login`, body, publicConfig);
    const challenge = MfaChallengeSchema.safeParse(data);
    if (challenge.success) return challenge.data;
    return LoginSuccessSchema.parse(data);
  },

  async verifyMfa(body: { mfaToken: string; code: string }): Promise<LoginSuccess> {
    const { data } = await http.post<unknown>(`${BASE}/mfa/verify`, body, publicConfig);
    return LoginSuccessSchema.parse(data);
  },

  /** Rotates the refresh cookie (aisits_rt) and returns a new access token. */
  async refresh(): Promise<TokenResponse> {
    const { data } = await http.post<unknown>(`${BASE}/refresh`, undefined, publicConfig);
    return TokenResponseSchema.parse(data);
  },

  /**
   * Revokes the refresh token family (POST /auth/logout, cookie only). Uses fetch with
   * `keepalive` so the request survives closing the tab right after "sign out". Resolves when
   * the server revoked the family or had nothing to revoke (401); rejects with an ApiProblem
   * on network errors, throttling and server errors.
   */
  async logout(): Promise<void> {
    const requestId = createRequestId();
    let response: Response;
    try {
      response = await fetch(apiUrl(`${BASE}/logout`), {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { Accept: 'application/json', 'X-Request-Id': requestId },
        // fetch has no timeout of its own; the session layer holds the cross-tab lock meanwhile.
        ...(typeof AbortSignal.timeout === 'function'
          ? { signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS) }
          : {}),
      });
    } catch (error) {
      throw new ApiProblem({
        kind: 'network',
        status: 0,
        code: 'NETWORK_ERROR',
        title: 'Network error',
        requestId,
        cause: error,
      });
    }
    if (response.ok || response.status === 401) return;
    throw new ApiProblem({
      kind: 'http',
      status: response.status,
      code: response.status === 429 ? 'RATE_LIMITED' : 'LOGOUT_FAILED',
      title: response.statusText || 'Sign-out failed',
      requestId,
    });
  },

  async switchOrg(orgId: string): Promise<TokenResponse> {
    const { data } = await http.post<unknown>(`${BASE}/switch-org`, { orgId });
    return TokenResponseSchema.parse(data);
  },

  async forgotPassword(email: string): Promise<void> {
    await http.post(`${BASE}/password/forgot`, { email }, publicConfig);
  },

  /** Resets a password or accepts an invite (token from the e-mail link). */
  async resetPassword(body: { token: string; password: string }): Promise<void> {
    await http.post(`${BASE}/password/reset`, body, publicConfig);
  },

  async changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
    await http.post(`${BASE}/password/change`, body);
  },

  async mfaSetup(): Promise<MfaSetup> {
    const { data } = await http.post<unknown>(`${BASE}/mfa/setup`);
    return MfaSetupSchema.parse(data);
  },

  async mfaEnable(code: string): Promise<void> {
    await http.post(`${BASE}/mfa/enable`, { code });
  },

  async mfaDisable(code: string): Promise<void> {
    await http.post(`${BASE}/mfa/disable`, { code });
  },

  async listSessions(): Promise<AuthSession[]> {
    const { data } = await http.get<unknown>(`${BASE}/sessions`);
    const list = Array.isArray(data) ? data : (data as { data?: unknown } | null)?.data;
    return z.array(AuthSessionSchema).parse(list ?? []);
  },

  async revokeSession(id: string): Promise<void> {
    await http.delete(`${BASE}/sessions/${encodeURIComponent(id)}`);
  },

  async me(): Promise<Me> {
    const { data } = await http.get<unknown>('/api/v2/me');
    const me = MeSchema.parse(data);
    return { ...me, memberships: normalizeMemberships(me.memberships) };
  },

  async updateMe(body: { name: string }): Promise<AuthUser> {
    const { data } = await http.patch<unknown>('/api/v2/me', body);
    return AuthUserSchema.parse(data);
  },
};
