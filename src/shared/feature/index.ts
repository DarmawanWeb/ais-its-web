import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { NavigateFunction, RouteObject } from 'react-router';

import type { PermissionRequirement } from '@/shared/auth/permissions';
import type { FeatureTranslations } from '@/shared/i18n';

/**
 * The contract between a feature folder and the app shell.
 *
 * Every folder `src/features/<id>/` has a `routes.tsx` exporting `feature` (built with
 * defineFeature). The shell discovers it automatically (import.meta.glob), registers its
 * translations under the namespace `<id>`, mounts its routes and adds its nav entries.
 */

/** Sidebar sections, in display order. */
export const NAV_SECTIONS = [
  'operations',
  'safety',
  'surveillance',
  'fleet',
  'settings',
  'knowledge',
] as const;
export type NavSectionId = (typeof NAV_SECTIONS)[number];

export interface NavItem {
  /** Unique id across the app, e.g. "safety.ews". */
  id: string;
  section: NavSectionId;
  /** Position inside the section (10, 20, 30… leaves room for new items). */
  order: number;
  /** Absolute path, e.g. "/safety/ews". */
  path: string;
  /** i18n key, usually in the feature namespace: "safety:nav.ews". */
  labelKey: string;
  icon: LucideIcon;
  /** Hidden when the user lacks the permission (a list means "any of"). */
  permission?: PermissionRequirement;
  /** Extra words for the command palette. */
  keywords?: readonly string[];
  /**
   * Active only on exactly `path` (react-router `NavLink end`). For a section overview whose
   * path is the prefix of other entries, e.g. `/surveillance` next to `/surveillance/dark`.
   */
  end?: boolean;
}

/** Metadata of a route, read by the shell through useMatches(). */
export interface AppRouteHandle {
  /** i18n key of the page title (document title and breadcrumb), e.g. "cii:title". */
  titleKey?: string;
  /** Required permission (or any of a list); the shell renders 403 when missing. */
  permission?: PermissionRequirement;
  /** "full-bleed": no shell padding, the page fills the content area (maps). */
  layout?: 'default' | 'full-bleed';
}

/** A route of a feature (react-router data route with an AppRouteHandle). */
export type FeatureRoute = RouteObject & { handle?: AppRouteHandle; children?: FeatureRoute[] };

export interface CommandContext {
  navigate: NavigateFunction;
}

/** Command palette entry contributed by a feature. */
export interface CommandItem {
  id: string;
  labelKey: string;
  icon?: LucideIcon;
  keywords?: readonly string[];
  permission?: PermissionRequirement;
  perform: (context: CommandContext) => void;
}

/**
 * Places in the shell where a feature can plug a component.
 *   - 'topbar.alerts': the alert bell (single owner: the alerts feature; a second claim fails
 *     at startup).
 *   - 'topbar.actions', 'sidebar.footer': shared by any number of features, rendered in
 *     `order` (then feature id).
 */
export type ShellSlotName = 'topbar.alerts' | 'topbar.actions' | 'sidebar.footer';
export type SingleShellSlotName = 'topbar.alerts';
export type MultiShellSlotName = Exclude<ShellSlotName, SingleShellSlotName>;

/** A component contributed to a shared slot; lower `order` renders first (default 100). */
export interface SlotContribution {
  component: ComponentType;
  order?: number;
}

export interface FeatureSlots {
  'topbar.alerts'?: ComponentType;
  'topbar.actions'?: ComponentType | SlotContribution | readonly SlotContribution[];
  'sidebar.footer'?: ComponentType | SlotContribution | readonly SlotContribution[];
}

export interface FeatureModule {
  /** Folder name; also the i18n namespace. */
  id: string;
  i18n?: FeatureTranslations;
  /** Routes inside the authenticated shell; paths are relative to "/" (e.g. "safety/ews"). */
  routes?: FeatureRoute[];
  /** Routes outside the shell and without authentication (login, password reset…). */
  publicRoutes?: RouteObject[];
  nav?: NavItem[];
  commands?: CommandItem[];
  slots?: FeatureSlots;
}

/** Identity helper that type-checks a feature module. */
export function defineFeature(feature: FeatureModule): FeatureModule {
  return feature;
}

/**
 * Lazy route component (code-split per page):
 *   { path: 'cii', lazy: lazyPage(() => import('./pages/cii-page'), 'CiiPage') }
 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M & string>(
  loader: () => Promise<M>,
  exportName: K,
): () => Promise<{ Component: ComponentType }> {
  return async () => {
    const module = await loader();
    return { Component: module[exportName] as ComponentType };
  };
}
