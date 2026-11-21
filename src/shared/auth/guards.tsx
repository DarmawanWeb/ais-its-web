import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';

import { ForbiddenState } from '@/shared/domain-ui/feedback';
import { SplashScreen } from '@/shared/domain-ui/splash-screen';

import { usePermission, useSession } from './hooks';
import { loginPath, safeRedirect } from './paths';
import type { PermissionRequirement } from './permissions';

/** Renders children (or the nested routes) only for signed-in users. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'unauthenticated') {
    return (
      <Navigate to={loginPath(`${location.pathname}${location.search}${location.hash}`)} replace />
    );
  }
  return children ?? <Outlet />;
}

/** Page-level guard: shows the 403 state when the permission is missing. */
export function RequirePermission({
  permission,
  children,
  fallback,
}: {
  /** One permission, or a list meaning "any of these". */
  permission: PermissionRequirement | undefined;
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = usePermission(permission);
  if (!allowed) return fallback === undefined ? <ForbiddenState /> : fallback;
  return children ?? <Outlet />;
}

/** Element-level gate for buttons and actions: `<Can permission="vessel:write">…</Can>`. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionRequirement;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(permission) ? children : fallback;
}

/** Public auth pages: signed-in users are sent to their destination. */
export function RedirectIfAuthenticated({ children }: { children?: ReactNode }) {
  const { status } = useSession();
  const [params] = useSearchParams();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'authenticated')
    return <Navigate to={safeRedirect(params.get('redirect'))} replace />;
  return children ?? <Outlet />;
}
