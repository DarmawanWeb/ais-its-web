// Auth service (spec §13.1) besides the session core of server.mjs: the signed-in profile and
// the organization list of the org switcher. Feature modules may override both (e.g. profile,
// admin) by declaring the same method and path.
import { permissionsForRoles, parseRoles } from '@darmawanweb/ais-its-contracts/auth';

import { DEMO_CREATED_AT, membershipsOf, organizationOf, ORGS, pageOf } from '../lib.mjs';

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/me',
    handler: ({ claims, user, send, problem }) => {
      if (!user) return problem(404, 'NOT_FOUND', 'Not found');
      return send(200, {
        id: user.id,
        email: user.email,
        name: user.name,
        status: 'active',
        mfaEnabled: false,
        isPlatformAdmin: user.platformAdmin,
        lastLoginAt: null,
        createdAt: DEMO_CREATED_AT,
        updatedAt: DEMO_CREATED_AT,
        memberships: membershipsOf(user),
        activeOrgId: claims.org ?? null,
        roles: claims.roles ?? [],
        permissions: [...permissionsForRoles(parseRoles(claims.roles ?? []))].sort(),
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/organizations',
    handler: ({ claims, url, send, problem }) => {
      if (!claims.roles?.includes('super_admin')) return problem(403, 'FORBIDDEN', 'Forbidden');
      const term = (url.searchParams.get('search') ?? '').toLowerCase();
      return send(
        200,
        pageOf(
          ORGS.filter((org) => !term || org.name.toLowerCase().includes(term)).map(organizationOf),
          url,
        ),
      );
    },
  },
];
