import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';

import { queryClient as defaultQueryClient } from '@/shared/api/query-client';
import { sessionStore } from '@/shared/auth/session';
import { appConfig } from '@/shared/config/env';
import { ThemeSync } from '@/shared/theme/theme';
import { Toaster } from '@/shared/ui/sonner';
import { TooltipProvider } from '@/shared/ui/tooltip';

const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: () => <module.ReactQueryDevtools buttonPosition="bottom-left" />,
      })),
    )
  : null;

/**
 * Tenant data must never leak between sessions or organizations: the cache is cleared on
 * sign-out and reset (refetching active queries) when the active organization changes.
 */
function SessionCacheGuard({ client }: { client: QueryClient }) {
  useEffect(
    () =>
      sessionStore.subscribe((state, previous) => {
        if (previous.status === 'authenticated' && state.status !== 'authenticated') {
          client.clear();
        } else if (
          state.status === 'authenticated' &&
          previous.status === 'authenticated' &&
          (state.claims?.org !== previous.claims?.org || state.claims?.sub !== previous.claims?.sub)
        ) {
          void client.resetQueries();
        }
      }),
    [client],
  );
  return null;
}

export function AppProviders({
  children,
  queryClient = defaultQueryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeSync />
        <SessionCacheGuard client={queryClient} />
        {children}
        <Toaster />
        {QueryDevtools && appConfig.enableQueryDevtools && (
          <Suspense fallback={null}>
            <QueryDevtools />
          </Suspense>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
