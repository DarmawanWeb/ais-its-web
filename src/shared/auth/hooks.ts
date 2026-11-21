import type { Permission, Role } from '@darmawanweb/ais-its-contracts/auth';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { sharedKeys } from '@/shared/api/query-keys';

import { authApi, type AuthUser, type Me, type Membership } from './auth-api';
import {
  claimsCanAccessOrg,
  isPlatformAdminRoles,
  permissionsOfRoles,
  satisfies,
  type PermissionRequirement,
} from './permissions';
import { type SessionEndReason, type SessionStatus, setProfile, useSessionStore } from './session';
import type { SessionClaims } from './token';

export interface SessionView {
  readonly status: SessionStatus;
  readonly isAuthenticated: boolean;
  /** Decoded access token claims (sub, org, roles, email, name, …). */
  readonly claims: SessionClaims | null;
  readonly userId: string | null;
  /** Active organization id. */
  readonly orgId: string | null;
  readonly roles: readonly Role[];
  readonly email: string;
  readonly name: string;
  readonly isPlatformAdmin: boolean;
  readonly user: AuthUser | null;
  readonly memberships: readonly Membership[];
  readonly activeMembership: Membership | null;
  readonly endReason: SessionEndReason | null;
}

const NO_ROLES: readonly Role[] = [];

/** The signed-in user's session (claims from the in-memory access token). */
export function useSession(): SessionView {
  const status = useSessionStore((s) => s.status);
  const claims = useSessionStore((s) => s.claims);
  const user = useSessionStore((s) => s.user);
  const memberships = useSessionStore((s) => s.memberships);
  const endReason = useSessionStore((s) => s.endReason);
  return useMemo(() => {
    const roles = claims?.roles ?? NO_ROLES;
    const orgId = claims?.org ?? null;
    return {
      status,
      isAuthenticated: status === 'authenticated',
      claims,
      userId: claims?.sub ?? null,
      orgId,
      roles,
      email: claims?.email ?? user?.email ?? '',
      name: claims?.name || user?.name || claims?.email || '',
      isPlatformAdmin: isPlatformAdminRoles(roles),
      user,
      memberships,
      activeMembership: memberships.find((m) => m.orgId === orgId) ?? null,
      endReason,
    };
  }, [status, claims, user, memberships, endReason]);
}

/** Every permission of the signed-in user (super_admin: all). */
export function usePermissions(): ReadonlySet<Permission> {
  const roles = useSessionStore((s) => s.claims?.roles);
  return useMemo(() => permissionsOfRoles(roles), [roles]);
}

/** True when the user has the permission (or any of the listed permissions). */
export function usePermission(requirement: PermissionRequirement | undefined): boolean {
  const granted = usePermissions();
  return satisfies(granted, requirement);
}

/** Tenant-private access rule of spec §8.5 for a record owned by `orgId`. */
export function useCanAccessOrg(orgId: string | null | undefined): boolean {
  const claims = useSessionStore((s) => s.claims);
  return claimsCanAccessOrg(claims, orgId ?? null);
}

/** GET /api/v2/me: profile and memberships of the signed-in user. */
export function useMe() {
  const isAuthenticated = useSessionStore((s) => s.status === 'authenticated');
  const userId = useSessionStore((s) => s.claims?.sub);
  return useQuery<Me>({
    queryKey: [...sharedKeys.me, userId],
    queryFn: async () => {
      const me = await authApi.me();
      setProfile(me, me.memberships);
      return me;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
