import type { Permission } from '@darmawanweb/ais-its-contracts/auth';
import type { ComponentType } from 'react';

import { satisfies } from '@/shared/auth/permissions';
import {
  NAV_SECTIONS,
  type CommandItem,
  type FeatureModule,
  type NavItem,
  type NavSectionId,
  type ShellSlotName,
} from '@/shared/feature';

export interface NavSection {
  id: NavSectionId;
  labelKey: string;
  items: NavItem[];
}

/** Sidebar sections with the entries the user may see (empty sections are dropped). */
export function buildNavigation(
  modules: readonly FeatureModule[],
  permissions: ReadonlySet<Permission>,
): NavSection[] {
  const items = modules.flatMap((feature) => feature.nav ?? []);
  return NAV_SECTIONS.map((section) => ({
    id: section,
    labelKey: `nav.sections.${section}`,
    items: items
      .filter((item) => item.section === section && satisfies(permissions, item.permission))
      .sort((a, b) => a.order - b.order),
  })).filter((section) => section.items.length > 0);
}

/** Commands contributed by features that the user may run. */
export function buildCommands(
  modules: readonly FeatureModule[],
  permissions: ReadonlySet<Permission>,
): CommandItem[] {
  return modules
    .flatMap((feature) => feature.commands ?? [])
    .filter((command) => satisfies(permissions, command.permission));
}

/** The component a feature plugged into a shell slot (first one wins). */
export function slotComponent(
  modules: readonly FeatureModule[],
  slot: ShellSlotName,
): ComponentType | null {
  for (const feature of modules) {
    const component = feature.slots?.[slot];
    if (component) return component;
  }
  return null;
}
