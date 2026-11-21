import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { appConfig } from '@/shared/config/env';
import { createRequestId } from '@/shared/lib/utils';

import { toApiProblem } from './problem';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not attach the access token (public endpoints). */
    skipAuth?: boolean;
    /** Do not try to refresh the session on 401 (auth endpoints). */
    skipAuthRefresh?: boolean;
    /** Internal: the request was already retried after a refresh. */
    _retried?: boolean;
  }
}

/**
 * Hooks the session layer (src/shared/auth) plugs into the HTTP client. Kept as a bridge
 * so the API layer has no import cycle with the session store.
 */
export interface AuthBridge {
  getAccessToken: () => string | null;
  /**
   * Single-flight refresh after `failedToken` was rejected; resolves to a fresh token, or
   * null when the session could not be refreshed (the session layer then decides whether
   * the user is signed out).
   */
  refreshAccessToken: (failedToken: string | null) => Promise<string | null>;
}

let bridge: AuthBridge | null = null;

export function setAuthBridge(next: AuthBridge | null): void {
  bridge = next;
}

/** The single axios instance of the app (same-origin `/api/v2/...` paths by default). */
export const http: AxiosInstance = axios.create({
  baseURL: appConfig.apiBaseUrl || undefined,
  timeout: 30_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

function setHeader(config: InternalAxiosRequestConfig, name: string, value: string): void {
  if (!(config.headers instanceof AxiosHeaders)) config.headers = AxiosHeaders.from(config.headers);
  config.headers.set(name, value);
}

http.interceptors.request.use((config) => {
  if (!config.headers?.['X-Request-Id']) setHeader(config, 'X-Request-Id', createRequestId());
  if (!config.skipAuth) {
    const token = bridge?.getAccessToken();
    if (token) setHeader(config, 'Authorization', `Bearer ${token}`);
  }
  return config;
});

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config;
  if (
    error.response?.status === 401 &&
    config &&
    bridge &&
    !config.skipAuth &&
    !config.skipAuthRefresh &&
    !config._retried
  ) {
    const sent = String(config.headers?.Authorization ?? '').replace(/^Bearer\s+/i, '');
    const token = await bridge.refreshAccessToken(sent || null);
    if (token) {
      config._retried = true;
      setHeader(config, 'Authorization', `Bearer ${token}`);
      // A new request id per attempt keeps the logs of both attempts apart.
      setHeader(config, 'X-Request-Id', createRequestId());
      return http.request(config);
    }
  }
  throw toApiProblem(error);
});
