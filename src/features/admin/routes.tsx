import { Building2, Cpu, Database, KeyRound, ScrollText, Users } from 'lucide-react';

import { defineFeature, lazyPage } from '@/shared/feature';

import en from './i18n/en.json';
import id from './i18n/id.json';

/** Administration: organizations, members, API keys, reference data, devices, audit log. */
export const feature = defineFeature({
  id: 'admin',
  i18n: { id, en },
  routes: [
    {
      path: 'admin/organizations',
      handle: { titleKey: 'admin:organizations.title', permission: 'org:manage' },
      lazy: lazyPage(() => import('./pages/organizations-page'), 'OrganizationsPage'),
    },
    {
      path: 'admin/members',
      handle: { titleKey: 'admin:members.title', permission: 'user:manage' },
      lazy: lazyPage(() => import('./pages/members-page'), 'MembersPage'),
    },
    {
      path: 'admin/api-keys',
      handle: { titleKey: 'admin:apiKeys.title', permission: 'api_key:manage' },
      lazy: lazyPage(() => import('./pages/api-keys-page'), 'ApiKeysPage'),
    },
    {
      path: 'admin/reference-data',
      handle: { titleKey: 'admin:referenceData.title', permission: 'vessel:read' },
      lazy: lazyPage(() => import('./pages/reference-data-page'), 'ReferenceDataPage'),
    },
    {
      path: 'admin/devices',
      handle: { titleKey: 'admin:devices.title', permission: 'device:manage' },
      lazy: lazyPage(() => import('./pages/devices-page'), 'DevicesPage'),
    },
    {
      path: 'admin/audit-log',
      handle: { titleKey: 'admin:auditLog.title', permission: 'audit:read' },
      lazy: lazyPage(() => import('./pages/audit-log-page'), 'AuditLogPage'),
    },
  ],
  nav: [
    {
      id: 'admin.organizations',
      section: 'settings',
      order: 30,
      path: '/admin/organizations',
      labelKey: 'admin:nav.organizations',
      icon: Building2,
      permission: 'org:manage',
      keywords: ['organisasi', 'organization', 'tenant'],
    },
    {
      id: 'admin.members',
      section: 'settings',
      order: 40,
      path: '/admin/members',
      labelKey: 'admin:nav.members',
      icon: Users,
      permission: 'user:manage',
      keywords: ['anggota', 'members', 'user', 'invite', 'undang'],
    },
    {
      id: 'admin.apiKeys',
      section: 'settings',
      order: 50,
      path: '/admin/api-keys',
      labelKey: 'admin:nav.apiKeys',
      icon: KeyRound,
      permission: 'api_key:manage',
      keywords: ['api key', 'kunci', 'token'],
    },
    {
      id: 'admin.referenceData',
      section: 'settings',
      order: 60,
      path: '/admin/reference-data',
      labelKey: 'admin:nav.referenceData',
      icon: Database,
      permission: 'vessel:read',
      keywords: [
        'referensi',
        'reference',
        'tipe kapal',
        'bahan bakar',
        'fuel',
        'mesin',
        'engine',
        'formula',
        'pelabuhan',
        'port',
        'registri',
      ],
    },
    {
      id: 'admin.devices',
      section: 'settings',
      order: 70,
      path: '/admin/devices',
      labelKey: 'admin:nav.devices',
      icon: Cpu,
      permission: 'device:manage',
      keywords: ['perangkat', 'device', 'mqtt', 'telemetri', 'flow meter'],
    },
    {
      id: 'admin.auditLog',
      section: 'settings',
      order: 80,
      path: '/admin/audit-log',
      labelKey: 'admin:nav.auditLog',
      icon: ScrollText,
      permission: 'audit:read',
      keywords: ['audit', 'log', 'jejak'],
    },
  ],
});
