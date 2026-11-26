import {
  createBrowserRouter,
  Navigate,
  Outlet,
  ScrollRestoration,
  type RouteObject,
} from 'react-router';

import { RequireAuth } from '@/shared/auth/guards';
import { HOME_PATH } from '@/shared/auth/paths';
import { SplashScreen } from '@/shared/domain-ui/splash-screen';
import type { FeatureModule } from '@/shared/feature';

import { features } from './features';
import { NotFoundPage } from './pages/not-found-page';
import { RootErrorPage, RouteErrorBoundary } from './pages/route-error-page';
import { AppShell } from './shell/app-shell';

function RootLayout() {
  return (
    <>
      <Outlet />
      {/* Every initial load has the key "default": key those by path, so a full page load
          never restores the scroll position of a different page. */}
      <ScrollRestoration
        getKey={(location) => (location.key === 'default' ? location.pathname : location.key)}
      />
    </>
  );
}

/**
 * Route tree, composed from the feature modules (src/features/<id>/routes.tsx):
 *   /                      → redirect to HOME_PATH
 *   public feature routes  → outside the shell (login, password reset…)
 *   feature routes         → RequireAuth → AppShell (permission gate) → page error boundary
 *   *                      → 404 inside the shell
 */
export function buildRoutes(modules: readonly FeatureModule[]): RouteObject[] {
  return [
    {
      id: 'root',
      element: <RootLayout />,
      errorElement: <RootErrorPage />,
      hydrateFallbackElement: <SplashScreen />,
      children: [
        ...modules.flatMap((feature) => feature.publicRoutes ?? []),
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [
                {
                  errorElement: <RouteErrorBoundary />,
                  children: [
                    { index: true, element: <Navigate to={HOME_PATH} replace /> },
                    ...modules.flatMap((feature) => feature.routes ?? []),
                    {
                      path: '*',
                      element: <NotFoundPage />,
                      handle: { titleKey: 'errors.notFound' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

export function createAppRouter() {
  return createBrowserRouter(buildRoutes(features));
}
