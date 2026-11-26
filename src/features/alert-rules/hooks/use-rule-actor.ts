import { useMemo } from 'react';

import { useSession } from '@/shared/auth';

import type { RuleActor } from '../lib/scope';

/** The signed-in principal as the rule-scope rules see it (active org, roles, platform admin). */
export function useRuleActor(): RuleActor {
  const session = useSession();
  return useMemo(
    () => ({
      orgId: session.orgId,
      roles: session.roles,
      isPlatformAdmin: session.isPlatformAdmin,
    }),
    [session.orgId, session.roles, session.isPlatformAdmin],
  );
}
