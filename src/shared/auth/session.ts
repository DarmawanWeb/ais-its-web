import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { setAuthBridge } from '@/shared/api/http';
import { isApiProblem } from '@/shared/api/problem';

import {
  authApi,
  isMfaChallenge,
  type AuthUser,
  type LoginSuccess,
  type Membership,
  normalizeMemberships,
  type TokenResponse,
} from './auth-api';
import { parseAccessToken, type SessionClaims } from './token';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type SessionEndReason = 'logout' | 'expired';

export interface SessionState {
  status: SessionStatus;
  /** Access token, kept in memory only (never localStorage, spec §8). */
  accessToken: string | null;
  /** Expiry of the access token, ms since epoch. */
  expiresAt: number | null;
  claims: SessionClaims | null;
  /** Profile returned at login (or by GET /me). */
  user: AuthUser | null;
  memberships: readonly Membership[];
  /** Why the last session ended (the login page explains it). */
  endReason: SessionEndReason | null;
}

const initialState: SessionState = {
  status: 'loading',
  accessToken: null,
  expiresAt: null,
  claims: null,
  user: null,
  memberships: [],
  endReason: null,
};

/** The session store. Read it with useSession(); mutate it only through this module. */
export const sessionStore = createStore<SessionState>(() => initialState);

export function useSessionStore<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;
const BROADCAST_CHANNEL = 'ais-auth';
const REFRESH_LOCK = 'ais-auth-refresh';

type BroadcastMessage =
  { type: 'token'; accessToken: string; expiresIn: number } | { type: 'logout' };

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshPromise: Promise<string | null> | null = null;
let bootstrapPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;

function broadcast(message: BroadcastMessage): void {
  try {
    channel?.postMessage(message);
  } catch {
    // ignore (channel closed)
  }
}

function scheduleRefresh(expiresAt: number): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  const delay = Math.max(5_000, expiresAt - Date.now() - REFRESH_MARGIN_MS);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken(sessionStore.getState().accessToken);
  }, delay);
}

function userFromClaims(claims: SessionClaims): AuthUser {
  return { id: claims.sub, email: claims.email, name: claims.name };
}

/**
 * Adopts a new access token (login, refresh, org switch or another tab). Keeps the profile
 * and memberships when the user did not change.
 */
function applyToken(
  tokens: TokenResponse,
  extras: { user?: AuthUser | undefined; memberships?: readonly Membership[] | undefined } = {},
): SessionClaims {
  const claims = parseAccessToken(tokens.accessToken);
  if (!claims) throw new Error('The access token could not be read');
  const expiresAt = Math.min(Date.now() + tokens.expiresIn * 1000, claims.exp * 1000);
  sessionStore.setState((previous) => {
    const sameUser = previous.claims?.sub === claims.sub;
    return {
      status: 'authenticated',
      accessToken: tokens.accessToken,
      expiresAt,
      claims,
      user: extras.user ?? (sameUser ? previous.user : null) ?? userFromClaims(claims),
      memberships: extras.memberships ?? (sameUser ? previous.memberships : []),
      endReason: null,
    };
  });
  scheduleRefresh(expiresAt);
  return claims;
}

/** Ends the session locally (no server call). */
export function clearSession(reason: SessionEndReason | null = null): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  sessionStore.setState({ ...initialState, status: 'unauthenticated', endReason: reason });
}

export function getAccessToken(): string | null {
  return sessionStore.getState().accessToken;
}

function tokenIsFresh(state: SessionState): boolean {
  return (
    !!state.accessToken && !!state.expiresAt && state.expiresAt - Date.now() > REFRESH_MARGIN_MS / 2
  );
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  // Serializes refreshes across tabs: the refresh cookie rotates on every use and presenting a
  // rotated cookie revokes the whole session (reuse detection, spec §8.3).
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) return locks.request(REFRESH_LOCK, task);
  return task();
}

async function performRefresh(failedToken: string | null): Promise<string | null> {
  return withRefreshLock(async () => {
    const state = sessionStore.getState();
    // Another tab (or an earlier call) already replaced the rejected token.
    if (state.accessToken && state.accessToken !== failedToken && tokenIsFresh(state)) {
      return state.accessToken;
    }
    try {
      const tokens = await authApi.refresh();
      applyToken(tokens);
      broadcast({ type: 'token', accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
      return tokens.accessToken;
    } catch (error) {
      const wasAuthenticated = sessionStore.getState().status === 'authenticated';
      const authFailure =
        isApiProblem(error) && error.status >= 400 && error.status < 500 && error.status !== 429;
      if (authFailure || !wasAuthenticated) {
        clearSession(wasAuthenticated ? 'expired' : null);
      } else {
        // Network or server trouble: keep the session and try again shortly.
        scheduleRefresh(Date.now() + REFRESH_MARGIN_MS + 15_000);
      }
      return null;
    }
  });
}

/**
 * Single-flight refresh: concurrent callers (401 interceptor, timer, socket reconnect) share
 * one request. Resolves to the new access token, or null when there is no valid session.
 */
export function refreshAccessToken(failedToken: string | null = null): Promise<string | null> {
  refreshPromise ??= performRefresh(failedToken).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Restores the session on page load from the refresh cookie (POST /auth/refresh). */
export function bootstrapSession(): Promise<void> {
  bootstrapPromise ??= refreshAccessToken(null).then(() => {
    if (sessionStore.getState().status === 'loading') clearSession(null);
  });
  return bootstrapPromise;
}

function completeLogin(result: LoginSuccess): SessionClaims {
  const claims = applyToken(result, {
    user: result.user,
    memberships: normalizeMemberships(result.memberships),
  });
  broadcast({ type: 'token', accessToken: result.accessToken, expiresIn: result.expiresIn });
  return claims;
}

export type LoginOutcome = { status: 'authenticated' } | { status: 'mfa'; mfaToken: string };

export async function login(email: string, password: string): Promise<LoginOutcome> {
  const result = await authApi.login({ email, password });
  if (isMfaChallenge(result)) return { status: 'mfa', mfaToken: result.mfaToken };
  completeLogin(result);
  return { status: 'authenticated' };
}

export async function verifyMfa(mfaToken: string, code: string): Promise<void> {
  completeLogin(await authApi.verifyMfa({ mfaToken, code }));
}

/** Signs out: revokes the refresh token family server side, then clears the local session. */
export async function logout(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // The local session ends anyway; the server revokes the family on expiry.
  } finally {
    clearSession('logout');
    broadcast({ type: 'logout' });
  }
}

/** Switches the active organization (POST /auth/switch-org) and adopts the new token. */
export async function switchOrganization(orgId: string): Promise<SessionClaims> {
  const tokens = await authApi.switchOrg(orgId);
  const claims = applyToken(tokens);
  broadcast({ type: 'token', accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
  return claims;
}

/** Stores the profile and memberships loaded by GET /me. */
export function setProfile(user: AuthUser, memberships: readonly Membership[]): void {
  sessionStore.setState({ user, memberships });
}

/** Wires the session into the HTTP client and other tabs. Called once at startup. */
export function initSession(): void {
  setAuthBridge({ getAccessToken, refreshAccessToken });
  if (typeof BroadcastChannel !== 'undefined' && channel === null) {
    channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;
      if (message.type === 'logout') {
        if (sessionStore.getState().status === 'authenticated') clearSession('logout');
      } else if (message.type === 'token') {
        try {
          applyToken({ accessToken: message.accessToken, expiresIn: message.expiresIn });
        } catch {
          // ignore malformed messages
        }
      }
    };
  }
}

/** Test helper: resets module state. */
export function resetSessionForTests(state: Partial<SessionState> = {}): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  refreshPromise = null;
  bootstrapPromise = null;
  sessionStore.setState({ ...initialState, ...state });
}

export { applyToken as adoptTokenForTests };
