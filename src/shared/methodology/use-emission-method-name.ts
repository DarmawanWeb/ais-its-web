import { useMethodologyControllerDescribe } from '@/shared/api/generated/emission/methodology/methodology';

import { useMethodName } from './use-method-name';

/**
 * `useMethodName` with the emission service's description of the methods it runs
 * (`GET /emission/methodology`) as the fallback for ids the installed catalog does not list
 * yet — the CII and SEEMP pages name every method they show.
 */
export function useEmissionMethodName(): (methodId: string) => string {
  const service = useMethodologyControllerDescribe({
    query: { staleTime: 10 * 60_000, retry: false },
  });
  return useMethodName(service.data?.methods);
}
