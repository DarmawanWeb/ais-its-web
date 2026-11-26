/**
 * Grant rules of the auth service (services/auth/README.md, "Rules"):
 *  - roles: `authority` only in organizations of kind `authority` (422 ROLE_NOT_GRANTABLE);
 *    an organization always keeps one `org_admin` (409 LAST_ORG_ADMIN);
 *  - API key scopes: `ais:ingest` writes the AIS feed shared by every tenant and is granted
 *    by super admins only (403 SCOPE_NOT_GRANTABLE); org admins grant `telemetry:ingest` and
 *    `ais:read`.
 */
export const ORG_ROLES = ['org_admin', 'fleet_manager', 'authority', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_KINDS = ['shipping_company', 'authority', 'research', 'platform'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const API_KEY_SCOPES = ['telemetry:ingest', 'ais:read', 'ais:ingest'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Roles the organization's kind allows. */
export function grantableRoles(orgKind: string | null | undefined): OrgRole[] {
  return ORG_ROLES.filter((role) => role !== 'authority' || orgKind === 'authority');
}

/** Scopes a user may grant (`ais:ingest` for platform administrators only). */
export function grantableScopes(isPlatformAdmin: boolean): ApiKeyScope[] {
  return API_KEY_SCOPES.filter((scope) => scope !== 'ais:ingest' || isPlatformAdmin);
}

/** Demoting or removing this member would leave the organization without an org_admin. */
export function isLastOrgAdmin(
  member: { role: string; status?: string },
  members: readonly { role: string }[],
): boolean {
  return member.role === 'org_admin' && members.filter((m) => m.role === 'org_admin').length <= 1;
}

/** Roles that block a change of the organization kind (members or invitations holding them). */
export function rolesBlockingKind(kind: string, roles: readonly string[]): string[] {
  return kind === 'authority' ? [] : [...new Set(roles.filter((role) => role === 'authority'))];
}

/**
 * Slug derived from a name like the auth service does when it is omitted: lowercase DNS label
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 63), accents removed.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
