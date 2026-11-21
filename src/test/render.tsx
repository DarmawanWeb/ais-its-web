import type { Role } from '@darmawanweb/ais-its-contracts/auth';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';

import { features } from '@/app/features';
import { AppProviders } from '@/app/providers';
import { buildRoutes } from '@/app/router';
import { createQueryClient } from '@/shared/api/query-client';
import { adoptTokenForTests, resetSessionForTests } from '@/shared/auth/session';

import { makeAccessToken, TEST_IDS } from './tokens';

export interface TestSession {
  roles?: Role[];
  org?: string | null;
}

export interface RenderOptions {
  /** Signed-in user (default) or `null` for an anonymous visitor. */
  session?: TestSession | null;
  /** Initial URL (default "/"). */
  route?: string;
  /** Custom routes; by default the full app route tree. */
  routes?: RouteObject[];
}

/** Puts a signed-in session in the store (as after POST /auth/refresh). */
export function signIn(session: TestSession = {}): void {
  adoptTokenForTests(
    {
      accessToken: makeAccessToken({
        roles: session.roles ?? ['fleet_manager'],
        org: session.org === undefined ? TEST_IDS.orgA : session.org,
      }),
      expiresIn: 900,
    },
    {
      memberships: [
        {
          orgId: TEST_IDS.orgA,
          orgName: 'PT Pelayaran Nusantara',
          orgSlug: null,
          orgKind: 'shipping_company',
          role: 'fleet_manager',
        },
      ],
    },
  );
}

/**
 * Renders the app (or custom routes) with providers, a memory router and a session.
 *   renderApp({ route: '/dashboard', session: { roles: ['viewer'] } })
 */
export function renderApp(
  options: RenderOptions = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const { session = {}, route = '/', routes } = options;
  if (session) signIn(session);
  else resetSessionForTests({ status: 'unauthenticated' });
  const router = createMemoryRouter(routes ?? buildRoutes(features), { initialEntries: [route] });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, gcTime: 0 } });
  const result = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}

/** Renders a component with providers and a router (single route at "/"). */
export function renderWithProviders(ui: ReactElement, options: Omit<RenderOptions, 'routes'> = {}) {
  return renderApp({ ...options, routes: [{ path: '*', element: ui }] });
}
