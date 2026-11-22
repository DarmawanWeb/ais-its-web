/** Public auth routes (owned by src/features/auth). */
export const AUTH_PATHS = {
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  acceptInvite: '/accept-invite',
} as const;

/** Where users land after signing in when no redirect is requested. */
export const HOME_PATH = '/dashboard';

/** Builds the login URL that brings the user back to `from` after signing in. */
export function loginPath(from?: string): string {
  if (!from || from === '/' || from.startsWith(AUTH_PATHS.login)) return AUTH_PATHS.login;
  return `${AUTH_PATHS.login}?redirect=${encodeURIComponent(from)}`;
}

// Browsers read "/\host" and "/<TAB>/host" as protocol-relative URLs (they treat a backslash
// as a slash and strip TAB, CR and LF), so backslashes and control characters are refused.
// eslint-disable-next-line no-control-regex
const UNSAFE_REDIRECT = /[\\\u0000-\u001f\u007f]/;

/**
 * Validates a post-login redirect target: a same-origin path, returned as pathname + search +
 * hash of the URL the browser would resolve. Anything else (other origins, protocol-relative
 * forms, backslashes, control characters, the auth pages) falls back to the home page.
 */
export function safeRedirect(
  target: string | null | undefined,
  origin: string = window.location.origin,
): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return HOME_PATH;
  if (UNSAFE_REDIRECT.test(target)) return HOME_PATH;
  let url: URL;
  try {
    url = new URL(target, origin);
  } catch {
    return HOME_PATH;
  }
  if (url.origin !== origin) return HOME_PATH;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (Object.values(AUTH_PATHS).some((auth) => url.pathname.startsWith(auth))) return HOME_PATH;
  return path;
}
