import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { OrganizationDto } from '@/shared/api/generated/auth/model';
import { useSession } from '@/shared/auth';

import { useAllOrganizations, useOrganization } from '../api/auth-admin';

export const ALL_ORGANIZATIONS = 'all';

export interface OrgContext {
  /** Organization whose records the page shows (null = every organization, platform admins). */
  readonly orgId: string | null;
  readonly orgName: string | null;
  readonly orgKind: string | null;
  readonly isPlatformAdmin: boolean;
  /** Organizations a platform administrator can pick (empty for everyone else). */
  readonly options: readonly OrganizationDto[];
  readonly setOrgId: (orgId: string | null) => void;
}

/**
 * The organization of a tenant-private admin page (spec §8.5): the active organization, or —
 * for platform administrators only — the one chosen in `?org=` (`all` for every organization
 * where the API allows it).
 */
export function useOrgContext({ allowAll = false }: { allowAll?: boolean } = {}): OrgContext {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const organizations = useAllOrganizations(session.isPlatformAdmin);
  const options = useMemo(() => organizations.data?.data ?? [], [organizations.data]);
  const requested = params.get('org');

  const orgId = session.isPlatformAdmin
    ? requested === ALL_ORGANIZATIONS
      ? allowAll
        ? null
        : session.orgId
      : (requested ?? session.orgId)
    : session.orgId;
  const selected = options.find((org) => org.id === orgId);
  const own = session.memberships.find((m) => m.orgId === orgId);
  // Kind and name unknown (e.g. memberships without them): members may read their own org.
  const fetched = useOrganization(!selected && !own?.orgKind ? orgId : null);

  const setOrgId = useCallback(
    (next: string | null) =>
      setParams(
        (current) => {
          const search = new URLSearchParams(current);
          if (next === null) search.set('org', ALL_ORGANIZATIONS);
          else if (next === session.orgId) search.delete('org');
          else search.set('org', next);
          return search;
        },
        { replace: true },
      ),
    [setParams, session.orgId],
  );

  return {
    orgId,
    orgName: selected?.name ?? own?.orgName ?? fetched.data?.name ?? null,
    orgKind: selected?.kind ?? own?.orgKind ?? fetched.data?.kind ?? null,
    isPlatformAdmin: session.isPlatformAdmin,
    options,
    setOrgId,
  };
}
