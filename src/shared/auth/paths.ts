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

/** Validates a post-login redirect target (same-origin absolute paths only). */
export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return HOME_PATH;
  if (Object.values(AUTH_PATHS).some((path) => target.startsWith(path))) return HOME_PATH;
  return target;
}
