import {
  canAccessOrg,
  PERMISSIONS,
  permissionsForRoles,
  type Permission,
  type Role,
  type UserPrincipal,
} from '@darmawanweb/ais-its-contracts/auth';

import type { SessionClaims } from './token';

/** A single permission, or a list meaning "any of these". */
export type PermissionRequirement = Permission | readonly Permission[];

const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSIONS);
const NO_PERMISSIONS: ReadonlySet<Permission> = new Set();

export function isPlatformAdminRoles(roles: readonly Role[]): boolean {
  return roles.includes('super_admin');
}

/** Permissions granted by roles (contracts ROLE_PERMISSIONS); super_admin has every permission. */
export function permissionsOfRoles(roles: readonly Role[] | undefined): ReadonlySet<Permission> {
  if (!roles || roles.length === 0) return NO_PERMISSIONS;
  if (isPlatformAdminRoles(roles)) return ALL_PERMISSIONS;
  return permissionsForRoles(roles);
}

/** True when the granted set satisfies the requirement (any of a list). */
export function satisfies(
  granted: ReadonlySet<Permission>,
  requirement: PermissionRequirement | undefined,
): boolean {
  if (requirement === undefined) return true;
  if (typeof requirement === 'string') return granted.has(requirement);
  return requirement.length === 0 || requirement.some((permission) => granted.has(permission));
}

export function principalFromClaims(claims: SessionClaims): UserPrincipal {
  return {
    kind: 'user',
    id: claims.sub,
    sessionId: claims.sid ?? '',
    orgId: claims.org,
    roles: claims.roles,
    email: claims.email,
    name: claims.name,
  };
}

/** Tenant-private access rule (spec §8.5) for the signed-in user. */
export function claimsCanAccessOrg(claims: SessionClaims | null, orgId: string | null): boolean {
  return claims ? canAccessOrg(principalFromClaims(claims), orgId) : false;
}
