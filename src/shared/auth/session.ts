import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { setAuthBridge } from '@/shared/api/http';
import { isApiProblem } from '@/shared/api/problem';
import { createRequestId } from '@/shared/lib/utils';

import {
  authApi,
  isMfaChallenge,
  type AuthUser,
  type LoginSuccess,
  type Membership,
  normalizeMemberships,
  type TokenResponse,
} from './auth-api';
import { withCrossTabLock } from './cross-tab-lock';
import { parseAccessToken, type SessionClaims } from './token';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type SessionEndReason = 'logout' | 'expired';

export interface SessionState {
  status: SessionStatus;
  /** Access token, kept in memory only (never localStorage, spec §8). */
  accessToken: string | null;
  /** Expiry of the access token, ms since epoch on the local clock. */
  expiresAt: number | null;
  claims: SessionClaims | null;
  /** Profile returned at login (or by GET /me). */
  user: AuthUser | null;
  memberships: readonly Membership[];
  /** Why the last session ended (the login page explains it). */
  endReason: SessionEndReason | null;
  /**
   * A sign-out has not reached the server yet (POST /auth/logout failed): the refresh cookie may
   * still be valid, so the session is never restored from it until the logout succeeds.
   */
  logoutPending: boolean;
}

const initialState: SessionState = {
  status: 'loading',
  accessToken: null,
  expiresAt: null,
  claims: null,
  user: null,
  memberships: [],
  endReason: null,
  logoutPending: false,
};

/** The session store. Read it with useSession(); mutate it only through this module. */
export const sessionStore = createStore<SessionState>(() => initialState);

export function useSessionStore<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const BROADCAST_CHANNEL = 'ais-auth';
/** One lock for every request that presents the refresh cookie (refresh, login, logout). */
const AUTH_LOCK = 'ais-auth-refresh';
/** Non-secret marker of an unfinished sign-out, shared by the tabs of this browser. */
const LOGOUT_PENDING_KEY = 'ais-auth:logout-pending';
/** Background retries of an unfinished sign-out while the page stays open. */
const LOGOUT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;
const LOGOUT_MAX_RETRIES = 12;

type TokenSource = 'login' | 'refresh' | 'switch';

type BroadcastMessage =
  | {
      type: 'token';
      source: TokenSource;
      accessToken: string;
      /** Local-clock expiry (all tabs share the clock). */
      expiresAt: number;
      expiresIn: number;
    }
  | { type: 'logout' };

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshPromise: Promise<string | null> | null = null;
let bootstrapPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let logoutRetryTimer: ReturnType<typeof setTimeout> | undefined;
let logoutRetries = 0;
/**
 * Incremented whenever the local session ends (sign-out, expiry, another tab signing out). A
 * request started under an older generation never touches the session when it completes: a
 * refresh that was in flight during a sign-out must not bring the session back.
 */
let generation = 0;

function broadcast(message: BroadcastMessage): void {
  try {
    channel?.postMessage(message);
  } catch {
    // ignore (channel closed)
  }
}

// --- pending sign-out marker (localStorage; never a secret) -------------------------------

interface LogoutPendingMarker {
  id: string;
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Used only when localStorage cannot be written (blocked storage): this tab still knows. */
let memoryMarker: LogoutPendingMarker | null = null;

function readLogoutPending(): LogoutPendingMarker | null {
  try {
    const raw = storage()?.getItem(LOGOUT_PENDING_KEY);
    if (!raw) return memoryMarker;
    const value = JSON.parse(raw) as Partial<LogoutPendingMarker> | null;
    return typeof value?.id === 'string' ? { id: value.id, at: Number(value.at) || 0 } : null;
  } catch {
    return memoryMarker;
  }
}

function markLogoutPending(): void {
  const marker: LogoutPendingMarker = { id: createRequestId(), at: Date.now() };
  try {
    const store = storage();
    if (!store) throw new Error('no storage');
    store.setItem(LOGOUT_PENDING_KEY, JSON.stringify(marker));
    memoryMarker = null;
  } catch {
    // Blocked storage: other tabs still learn about the sign-out from the broadcast.
    memoryMarker = marker;
  }
}

/** Removes the marker (only the one that was read, when `expected` is given). */
function clearLogoutPending(expected?: LogoutPendingMarker): void {
  if (!expected || memoryMarker?.id === expected.id) memoryMarker = null;
  try {
    const store = storage();
    if (!store) return;
    if (expected && readLogoutPending()?.id !== expected.id) return;
    store.removeItem(LOGOUT_PENDING_KEY);
  } catch {
    // ignore
  }
}

function syncLogoutPending(): void {
  const pending = readLogoutPending() !== null;
  if (sessionStore.getState().logoutPending !== pending) {
    sessionStore.setState({ logoutPending: pending });
  }
}

// --- tokens ---------------------------------------------------------------------------------

function scheduleRefresh(expiresAt: number): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresAt - Date.now() - REFRESH_MARGIN_MS);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken(sessionStore.getState().accessToken);
  }, delay);
}

function userFromClaims(claims: SessionClaims): AuthUser {
  return { id: claims.sub, email: claims.email, name: claims.name };
}

/**
 * Lifetime of an access token from the server's relative values only (`expiresIn`, and
 * `exp − iat` of the same token). The absolute `exp` is never compared with the local clock: a
 * clock running ahead of the server would otherwise schedule a refresh every few seconds.
 */
export function tokenLifetimeMs(tokens: TokenResponse, claims: SessionClaims): number {
  const fromResponse = tokens.expiresIn * 1000;
  const fromClaims = (claims.exp - claims.iat) * 1000;
  return fromClaims > 0 ? Math.min(fromResponse, fromClaims) : fromResponse;
}

interface ApplyTokenExtras {
  user?: AuthUser | undefined;
  memberships?: readonly Membership[] | undefined;
  /** Local-clock expiry (tokens from other tabs); default: now + lifetime. */
  expiresAt?: number | undefined;
}

/**
 * Adopts a new access token (login, refresh, org switch or another tab). Keeps the profile
 * and memberships when the user did not change.
 */
function applyToken(tokens: TokenResponse, extras: ApplyTokenExtras = {}): SessionClaims {
  const claims = parseAccessToken(tokens.accessToken);
  if (!claims) throw new Error('The access token could not be read');
  const expiresAt = extras.expiresAt ?? Date.now() + tokenLifetimeMs(tokens, claims);
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

function broadcastToken(source: TokenSource, tokens: TokenResponse): void {
  const { expiresAt } = sessionStore.getState();
  broadcast({
    type: 'token',
    source,
    accessToken: tokens.accessToken,
    expiresAt: expiresAt ?? Date.now() + tokens.expiresIn * 1000,
    expiresIn: tokens.expiresIn,
  });
}

/** Ends the session locally (no server call). */
export function clearSession(reason: SessionEndReason | null = null): void {
  generation += 1;
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  sessionStore.setState({
    ...initialState,
    status: 'unauthenticated',
    endReason: reason,
    logoutPending: readLogoutPending() !== null,
  });
}

export function getAccessToken(): string | null {
  return sessionStore.getState().accessToken;
}

function tokenIsFresh(state: SessionState): boolean {
  return (
    !!state.accessToken && !!state.expiresAt && state.expiresAt - Date.now() > REFRESH_MARGIN_MS / 2
  );
}

// --- refresh ---------------------------------------------------------------------------------

async function performRefresh(failedToken: string | null): Promise<string | null> {
  const started = generation;
  // Serialized across tabs: the refresh cookie rotates on every use and presenting a rotated
  // cookie revokes the whole session (reuse detection, spec §8.3).
  return withCrossTabLock(AUTH_LOCK, async () => {
    const state = sessionStore.getState();
    // Signed out (here or in another tab) while waiting, or nothing to refresh.
    if (generation !== started || state.status === 'unauthenticated') return null;
    if (readLogoutPending()) {
      // A sign-out has not reached the server: never rotate the cookie, revoke it instead.
      clearSession('logout');
      await attemptRevocation();
      return null;
    }
    // Another tab (or an earlier call) already replaced the rejected token.
    if (state.accessToken && state.accessToken !== failedToken && tokenIsFresh(state)) {
      return state.accessToken;
    }
    try {
      const tokens = await authApi.refresh();
      // The session ended while the request was in flight: drop the new token.
      if (generation !== started) return null;
      if (readLogoutPending()) {
        clearSession('logout');
        return null;
      }
      applyToken(tokens);
      broadcastToken('refresh', tokens);
      return tokens.accessToken;
    } catch (error) {
      if (generation !== started) return null;
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

/**
 * Restores the session on page load from the refresh cookie (POST /auth/refresh). While a
 * sign-out is pending it calls POST /auth/logout instead and never restores the session.
 */
export function bootstrapSession(): Promise<void> {
  bootstrapPromise ??= (async () => {
    if (readLogoutPending()) {
      clearSession('logout');
      if (!(await retryPendingLogout())) scheduleLogoutRetry();
      return;
    }
    await refreshAccessToken(null);
    if (sessionStore.getState().status === 'loading') clearSession(null);
  })();
  return bootstrapPromise;
}

// --- login -----------------------------------------------------------------------------------

function completeLogin(result: LoginSuccess): SessionClaims {
  // The login replaced the refresh cookie: an earlier unfinished sign-out has nothing left to
  // revoke in this browser.
  clearLogoutPending();
  cancelLogoutRetry();
  const claims = applyToken(result, {
    user: result.user,
    memberships: normalizeMemberships(result.memberships),
  });
  sessionStore.setState({ logoutPending: false });
  broadcastToken('login', result);
  return claims;
}

export type LoginOutcome = { status: 'authenticated' } | { status: 'mfa'; mfaToken: string };

export async function login(email: string, password: string): Promise<LoginOutcome> {
  // Best effort: revoke the previous session family before replacing its cookie.
  if (readLogoutPending()) await retryPendingLogout();
  const result = await withCrossTabLock(AUTH_LOCK, () => authApi.login({ email, password }));
  if (isMfaChallenge(result)) return { status: 'mfa', mfaToken: result.mfaToken };
  completeLogin(result);
  return { status: 'authenticated' };
}

export async function verifyMfa(mfaToken: string, code: string): Promise<void> {
  completeLogin(await withCrossTabLock(AUTH_LOCK, () => authApi.verifyMfa({ mfaToken, code })));
}

// --- logout ----------------------------------------------------------------------------------

/** POST /auth/logout; true when the server revoked the family (or there was none). */
async function attemptRevocation(): Promise<boolean> {
  const pending = readLogoutPending();
  try {
    await authApi.logout();
  } catch {
    try {
      // One immediate second attempt (keepalive: survives closing the tab).
      await authApi.logout();
    } catch {
      return false;
    }
  }
  if (pending) clearLogoutPending(pending);
  return true;
}

function cancelLogoutRetry(): void {
  if (logoutRetryTimer !== undefined) clearTimeout(logoutRetryTimer);
  logoutRetryTimer = undefined;
  logoutRetries = 0;
}

function scheduleLogoutRetry(): void {
  if (logoutRetryTimer !== undefined || logoutRetries >= LOGOUT_MAX_RETRIES) return;
  const delay =
    LOGOUT_RETRY_DELAYS_MS[Math.min(logoutRetries, LOGOUT_RETRY_DELAYS_MS.length - 1)] ?? 60_000;
  logoutRetryTimer = setTimeout(() => {
    logoutRetryTimer = undefined;
    logoutRetries += 1;
    void retryPendingLogout().then((done) => {
      if (!done) scheduleLogoutRetry();
    });
  }, delay);
}

/**
 * Retries an unfinished sign-out (the "retry" action of the notice, background retries and
 * page loads). Resolves to true when nothing is pending any more.
 */
export async function retryPendingLogout(): Promise<boolean> {
  if (!readLogoutPending()) {
    syncLogoutPending();
    return true;
  }
  const done = await withCrossTabLock(AUTH_LOCK, async () =>
    // A login in another tab may have replaced the cookie while this call waited.
    readLogoutPending() ? attemptRevocation() : true,
  );
  if (done) cancelLogoutRetry();
  syncLogoutPending();
  return done;
}

export interface LogoutResult {
  /** The server revoked the session (refresh token family). */
  revoked: boolean;
}

/**
 * Signs out. The local session ends at once (this and the other tabs), then the refresh token
 * family is revoked server side (POST /auth/logout, under the same cross-tab lock as refreshes,
 * so a refresh in flight finishes first and its token is dropped). When the server cannot be
 * reached the result says so, a non-secret marker stays in localStorage and the session is
 * never restored from the cookie (bootstrap calls /auth/logout instead) until the revocation
 * succeeds; it is retried in the background.
 */
export async function logout(): Promise<LogoutResult> {
  markLogoutPending();
  clearSession('logout');
  broadcast({ type: 'logout' });
  const revoked = await withCrossTabLock(AUTH_LOCK, attemptRevocation);
  syncLogoutPending();
  if (revoked) cancelLogoutRetry();
  else scheduleLogoutRetry();
  return { revoked };
}

// --- organizations and profile ---------------------------------------------------------------

/** Switches the active organization (POST /auth/switch-org) and adopts the new token. */
export async function switchOrganization(orgId: string): Promise<SessionClaims> {
  const started = generation;
  const tokens = await authApi.switchOrg(orgId);
  if (generation !== started || readLogoutPending()) {
    throw new Error('The session ended while switching the organization');
  }
  const claims = applyToken(tokens);
  broadcastToken('switch', tokens);
  return claims;
}

/** Stores the profile and memberships loaded by GET /me. */
export function setProfile(user: AuthUser, memberships: readonly Membership[]): void {
  sessionStore.setState({ user, memberships });
}

function onBroadcast(message: BroadcastMessage | null | undefined): void {
  if (!message) return;
  if (message.type === 'logout') {
    if (sessionStore.getState().status !== 'unauthenticated') clearSession('logout');
    else syncLogoutPending();
    return;
  }
  if (message.type !== 'token') return;
  // Tokens minted before a sign-out (a refresh that was in flight) are never adopted; a
  // signed-out tab only follows a new login.
  if (readLogoutPending()) return;
  if (sessionStore.getState().status === 'unauthenticated' && message.source !== 'login') return;
  try {
    applyToken(
      { accessToken: message.accessToken, expiresIn: message.expiresIn },
      { expiresAt: Number.isFinite(message.expiresAt) ? message.expiresAt : undefined },
    );
  } catch {
    // ignore malformed messages
  }
}

/** Wires the session into the HTTP client and other tabs. Called once at startup. */
export function initSession(): void {
  setAuthBridge({ getAccessToken, refreshAccessToken });
  if (typeof BroadcastChannel !== 'undefined' && channel === null) {
    channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => onBroadcast(event.data);
  }
}

/** Test helper: resets module state. */
export function resetSessionForTests(state: Partial<SessionState> = {}): void {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  refreshPromise = null;
  bootstrapPromise = null;
  cancelLogoutRetry();
  memoryMarker = null;
  generation += 1;
  sessionStore.setState({ ...initialState, ...state });
}

/** Test helper: delivers a message as if another tab had broadcast it. */
export function receiveBroadcastForTests(message: BroadcastMessage): void {
  onBroadcast(message);
}

export { applyToken as adoptTokenForTests, LOGOUT_PENDING_KEY };
