import { PERMISSIONS } from '@darmawanweb/ais-its-contracts/auth';
import { describe, expect, it } from 'vitest';

import { makeAccessToken, TEST_IDS } from '@/test/tokens';

import { claimsCanAccessOrg, permissionsOfRoles, satisfies } from './permissions';
import { parseAccessToken } from './token';

describe('permissions', () => {
  it('grants every permission to super_admin', () => {
    const granted = permissionsOfRoles(['super_admin']);
    expect(PERMISSIONS.every((permission) => granted.has(permission))).toBe(true);
  });

  it('follows ROLE_PERMISSIONS for organization roles', () => {
    const viewer = permissionsOfRoles(['viewer']);
    expect(viewer.has('vessel:read')).toBe(true);
    expect(viewer.has('vessel:write')).toBe(false);
    expect(viewer.has('telemetry:read')).toBe(false);
    const authority = permissionsOfRoles(['authority']);
    expect(authority.has('surveillance:review')).toBe(true);
    expect(authority.has('cii:read')).toBe(false);
  });

  it('treats a list as "any of"', () => {
    const viewer = permissionsOfRoles(['viewer']);
    expect(satisfies(viewer, ['vessel:write', 'cii:read'])).toBe(true);
    expect(satisfies(viewer, ['vessel:write', 'org:manage'])).toBe(false);
    expect(satisfies(viewer, undefined)).toBe(true);
    expect(satisfies(permissionsOfRoles([]), 'vessel:read')).toBe(false);
  });

  it('applies the tenant-private rule of spec §8.5', () => {
    const member = parseAccessToken(
      makeAccessToken({ roles: ['fleet_manager'], org: TEST_IDS.orgA }),
    );
    const admin = parseAccessToken(makeAccessToken({ roles: ['super_admin'], org: null }));
    expect(claimsCanAccessOrg(member, TEST_IDS.orgA)).toBe(true);
    expect(claimsCanAccessOrg(member, TEST_IDS.orgB)).toBe(false);
    expect(claimsCanAccessOrg(member, null)).toBe(false);
    expect(claimsCanAccessOrg(admin, TEST_IDS.orgB)).toBe(true);
    expect(claimsCanAccessOrg(null, TEST_IDS.orgA)).toBe(false);
  });
});
