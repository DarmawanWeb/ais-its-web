import { useMemo } from 'react';

import { usePermission, useSession } from '@/shared/auth';

import { canWriteGlobal, canWriteZone, type ZoneWriteContext } from '../lib/zone-model';

/** The signed-in user's zone write rights (`zone:write`, roles, active organization). */
export function useZoneAccess() {
  const canWrite = usePermission('zone:write');
  const { roles, orgId, isPlatformAdmin } = useSession();
  return useMemo(() => {
    const context: ZoneWriteContext = {
      canWrite,
      isSuperAdmin: isPlatformAdmin || roles.includes('super_admin'),
      isAuthority: roles.includes('authority'),
      orgId,
    };
    return {
      context,
      canWrite,
      /** May create zones at all: global ones, or organization ones with an active organization. */
      canCreate: canWrite && (canWriteGlobal(context) || orgId !== null),
      canWriteGlobal: canWriteGlobal(context),
      canWriteZone: (zone: { global: boolean; orgId: string | null }) =>
        canWriteZone(context, zone),
    };
  }, [canWrite, roles, orgId, isPlatformAdmin]);
}
