/**
 * Query key convention.
 *
 * - Generated hooks (src/shared/api/generated/<service>) use orval's URL based keys and
 *   export getters (`getListVesselsQueryKey(params)`); invalidate with those getters.
 * - Hand-written queries use `[service, resource, kind, params]` built with serviceKeys():
 *
 *     const fleetKeys = serviceKeys('fleet');
 *     useQuery({ queryKey: fleetKeys.resource('vessels').list({ search }), queryFn });
 *     queryClient.invalidateQueries({ queryKey: fleetKeys.resource('vessels').all });
 *
 * Switching organisation clears the whole cache (tenant data must never leak).
 */
export function serviceKeys<const Service extends string>(service: Service) {
  return {
    all: [service] as const,
    resource<const Resource extends string>(resource: Resource) {
      return {
        all: [service, resource] as const,
        list: <Params extends object>(params?: Params) =>
          [service, resource, 'list', params ?? {}] as const,
        detail: (id: string | number) => [service, resource, 'detail', id] as const,
        sub: <Params extends object>(kind: string, params?: Params) =>
          [service, resource, kind, params ?? {}] as const,
      };
    },
  };
}

/** Keys owned by the shared layer. */
export const sharedKeys = {
  me: ['auth', 'me'] as const,
  organizations: (search?: string) => ['auth', 'organizations', 'list', { search }] as const,
  vesselSearch: (term: string) => ['fleet', 'vessels', 'search', { term }] as const,
} as const;
