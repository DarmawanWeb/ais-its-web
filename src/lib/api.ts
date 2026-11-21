import axios from 'axios';
import { VITE_BACKEND_URI } from './env';

/**
 * localStorage key of an access token from POST /api/v1/auth/login. Phase 0
 * has no login screen; when a token is stored it is sent with every backend
 * request (reads are public, writes need it).
 */
export const ACCESS_TOKEN_STORAGE_KEY = 'aisits.accessToken';
/** The key before the platform was renamed to AIS Maritime Intelligence. */
const LEGACY_ACCESS_TOKEN_STORAGE_KEY = 'seemp.accessToken';

/** Moves a token stored under the legacy key; runs once, at startup. */
const migrateLegacyAccessToken = (): void => {
  try {
    const storage = window.localStorage;
    const legacyToken = storage.getItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
    if (legacyToken === null) return;
    storage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
    if (storage.getItem(ACCESS_TOKEN_STORAGE_KEY) === null) {
      storage.setItem(ACCESS_TOKEN_STORAGE_KEY, legacyToken);
    }
  } catch {
    // storage unavailable (private mode, blocked cookies)
  }
};

export const getStoredAccessToken = (): string | null => {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null; // storage unavailable (private mode, blocked cookies)
  }
};

/** Only the backend gets the token, never third-party hosts. */
const isBackendRequest = (url: string | undefined): boolean =>
  !!url &&
  (url.startsWith('/') ||
    (!!VITE_BACKEND_URI && url.startsWith(VITE_BACKEND_URI)));

let interceptorInstalled = false;

/** Call once at startup. */
export const installAuthInterceptor = (): void => {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  migrateLegacyAccessToken();
  axios.interceptors.request.use((config) => {
    const token = getStoredAccessToken();
    if (token && isBackendRequest(config.url)) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });
};

/** True for requests aborted through an AbortSignal (unmount, new selection). */
export const isRequestCanceled = (error: unknown): boolean =>
  axios.isCancel(error);

export const isNotFoundError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

/** The backend's `message` of a failed request, if any. */
export const getApiErrorMessage = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const message: unknown = error.response?.data?.message;
  return typeof message === 'string' ? message : undefined;
};
