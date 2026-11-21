import { QueryClient } from '@tanstack/react-query';

import { type ApiProblem, isApiProblem } from './problem';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiProblem;
  }
}

const MAX_RETRIES = 2;

/** Retry policy: never retry 4xx (they will not succeed), retry network/5xx twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiProblem(error)) {
    if (error.kind === 'canceled') return false;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

/** The app-wide QueryClient (tests create their own with createQueryClient()). */
export const queryClient = createQueryClient();
