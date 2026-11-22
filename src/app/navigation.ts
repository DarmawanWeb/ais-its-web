import type { Permission } from '@darmawanweb/ais-its-contracts/auth';
import type { ComponentType } from 'react';

import { satisfies } from '@/shared/auth/permissions';
import {
  NAV_SECTIONS,
  type CommandItem,
  type FeatureModule,
  type MultiShellSlotName,
  type NavItem,
  type NavSectionId,
  type SingleShellSlotName,
  type SlotContribution,
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

const DEFAULT_SLOT_ORDER = 100;

export interface ResolvedSlotContribution {
  /** Feature id + index: a stable React key. */
  key: string;
  featureId: string;
  order: number;
  component: ComponentType;
}

function contributionsOf(
  value: ComponentType | SlotContribution | readonly SlotContribution[] | undefined,
): SlotContribution[] {
  if (!value) return [];
  if (Array.isArray(value)) return [...(value as readonly SlotContribution[])];
  if (typeof value === 'object' && 'component' in value) return [value];
  return [{ component: value as ComponentType }];
}

/**
 * Components contributed to a shared slot ('topbar.actions', 'sidebar.footer') by every
 * feature, sorted by `order`, then feature id (never silently dropped).
 */
export function slotContributions(
  modules: readonly FeatureModule[],
  slot: MultiShellSlotName,
): ResolvedSlotContribution[] {
  return modules
    .flatMap((feature) =>
      contributionsOf(feature.slots?.[slot]).map((contribution, index) => ({
        key: `${feature.id}:${index}`,
        featureId: feature.id,
        order: contribution.order ?? DEFAULT_SLOT_ORDER,
        component: contribution.component,
      })),
    )
    .sort((a, b) => a.order - b.order || a.featureId.localeCompare(b.featureId));
}

/** The component of a single-owner slot ('topbar.alerts'); null when no feature claims it. */
export function singleSlotComponent(
  modules: readonly FeatureModule[],
  slot: SingleShellSlotName,
): ComponentType | null {
  const owners = modules.filter((feature) => feature.slots?.[slot]);
  if (owners.length > 1) {
    throw new Error(
      `Shell slot "${slot}" has a single owner but is claimed by ${owners.map((f) => `"${f.id}"`).join(' and ')}`,
    );
  }
  return owners[0]?.slots?.[slot] ?? null;
}

/**
 * Checks the feature modules at startup (features.ts): unique ids, folder = id, and at most one
 * owner per single-owner slot. Throws with a message naming the offending features.
 */
export function validateFeatures(
  modules: readonly { path: string; feature: FeatureModule | undefined }[],
): FeatureModule[] {
  const list: FeatureModule[] = [];
  const ids = new Set<string>();
  for (const { path, feature } of modules) {
    const folder = /features\/([^/]+)\/routes\.tsx$/.exec(path)?.[1];
    if (!feature) throw new Error(`${path} must export "feature" (defineFeature(...))`);
    if (feature.id !== folder) {
      throw new Error(`${path}: feature.id "${feature.id}" must equal its folder name "${folder}"`);
    }
    if (ids.has(feature.id)) throw new Error(`Duplicate feature id "${feature.id}"`);
    ids.add(feature.id);
    list.push(feature);
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  singleSlotComponent(list, 'topbar.alerts');
  return list;
}
