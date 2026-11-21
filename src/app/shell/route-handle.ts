import { useMatches } from 'react-router';

import type { PermissionRequirement } from '@/shared/auth/permissions';
import type { AppRouteHandle } from '@/shared/feature';

export interface ResolvedRouteHandle {
  titleKey: string | undefined;
  /** Permission requirements of every matched route (all must be satisfied). */
  permissions: PermissionRequirement[];
  layout: 'default' | 'full-bleed';
}

/** Merges the handles of the matched routes (deepest title and layout win). */
export function useRouteHandle(): ResolvedRouteHandle {
  const matches = useMatches();
  let titleKey: string | undefined;
  let layout: ResolvedRouteHandle['layout'] = 'default';
  const permissions: PermissionRequirement[] = [];
  for (const match of matches) {
    const handle = match.handle as AppRouteHandle | undefined;
    if (!handle) continue;
    if (handle.titleKey) titleKey = handle.titleKey;
    if (handle.layout) layout = handle.layout;
    if (handle.permission) permissions.push(handle.permission);
  }
  return { titleKey, permissions, layout };
}
