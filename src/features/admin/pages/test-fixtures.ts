/**
 * MSW fixtures of the admin pages' component tests, typed with the generated DTOs so a contract
 * change fails the typecheck. Imported by tests only.
 */
import { http, HttpResponse } from 'msw';

import type {
  ApiKeyDto,
  AuditLogDto,
  DirectoryUserDto,
  InvitationDto,
  MemberDto,
  OrganizationDto,
} from '@/shared/api/generated/auth/model';
import type {
  EngineDto,
  FuelDto,
  FuelFormulaDto,
  PortDto,
  VesselTypeDto,
} from '@/shared/api/generated/fleet/model';
import type { DeviceDto } from '@/shared/api/generated/telemetry/model';
import { server } from '@/test/msw/server';
import { TEST_IDS } from '@/test/tokens';

export const APP = { timeout: 10_000 };
const AT = '2026-11-01T00:00:00.000Z';
export const OTHER_ORG = '0192f0c8-7d3a-7c2e-9a1b-000000000009';

export function problem(
  status: number,
  code: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  return HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, status, code, title, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export const page = <T>(data: T[]) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});

export const ORGANIZATIONS: OrganizationDto[] = [
  {
    id: TEST_IDS.orgA,
    name: 'PT Pelayaran Nusantara',
    slug: 'pelayaran-nusantara',
    kind: 'shipping_company',
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: TEST_IDS.orgB,
    name: 'KSOP Batam',
    slug: 'ksop-batam',
    kind: 'authority',
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: OTHER_ORG,
    name: 'AIS Maritime Intelligence',
    slug: 'ais-maritime-intelligence',
    kind: 'platform',
    createdAt: AT,
    updatedAt: AT,
  },
];

export const MEMBERS: MemberDto[] = [
  {
    userId: TEST_IDS.user,
    email: 'admin@pelni.test',
    name: 'Dewi Admin',
    status: 'active',
    role: 'org_admin',
    mfaEnabled: true,
    lastLoginAt: '2026-11-22T08:00:00.000Z',
    joinedAt: AT,
  },
  {
    userId: '0192f0c8-7d3a-7c2e-9a31-000000000002',
    email: 'budi.santoso@pelni.test',
    name: 'Budi Santoso',
    status: 'active',
    role: 'viewer',
    mfaEnabled: false,
    lastLoginAt: null,
    joinedAt: AT,
  },
];

export const INVITATIONS: InvitationDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a32-000000000001',
    email: 'yusuf.maulana@pelni.test',
    name: 'Yusuf Maulana',
    role: 'fleet_manager',
    invitedBy: TEST_IDS.user,
    createdAt: '2026-11-20T08:00:00.000Z',
    expiresAt: '2099-11-27T08:00:00.000Z',
    expired: false,
  },
];

export const API_KEYS: ApiKeyDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a33-000000000001',
    orgId: TEST_IDS.orgA,
    name: 'Flow meter KM Bahari Nusantara',
    prefix: 'sk_7Hq2LmZx9a',
    scopes: ['telemetry:ingest'],
    createdBy: TEST_IDS.user,
    lastUsedAt: '2026-11-22T08:00:00.000Z',
    revokedAt: null,
    createdAt: AT,
  },
];

export const DIRECTORY: DirectoryUserDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a31-000000000002',
    email: 'budi.santoso@pelni.test',
    name: 'Budi Santoso',
    status: 'active',
    mfaEnabled: false,
    isPlatformAdmin: false,
    lastLoginAt: null,
    createdAt: AT,
    updatedAt: AT,
    memberships: [{ orgId: TEST_IDS.orgA, role: 'viewer' }],
  },
];

export const AUDIT: AuditLogDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a35-000000000001',
    at: '2026-11-22T08:00:00.000Z',
    source: 'auth',
    actorType: 'user',
    actorId: TEST_IDS.user,
    orgId: TEST_IDS.orgA,
    action: 'membership.update',
    targetType: 'user',
    targetId: '0192f0c8-7d3a-7c2e-9a31-000000000002',
    ip: '36.85.110.4',
    userAgent: 'Mozilla/5.0',
    meta: { from: 'viewer', to: 'fleet_manager' },
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a35-000000000002',
    at: '2026-11-21T08:00:00.000Z',
    source: 'auth',
    actorType: 'system',
    actorId: null,
    orgId: TEST_IDS.orgA,
    action: 'auth.login.failed',
    targetType: 'user',
    targetId: null,
    ip: null,
    userAgent: null,
    meta: { reason: 'INVALID_CREDENTIALS' },
  },
];

export const DEVICES: DeviceDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a34-000000000001',
    orgId: TEST_IDS.orgA,
    mmsi: 525005223,
    name: 'Flow meter ME KM Bahari Nusantara',
    kind: 'http',
    apiKeyId: API_KEYS[0]!.id,
    status: 'active',
    serialNumber: 'FM-2207-0042',
    mqttTopic: null,
    lastSeenAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    createdBy: TEST_IDS.user,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: '0192f0c8-7d3a-7c2e-9a34-000000000002',
    orgId: TEST_IDS.orgA,
    mmsi: 525019001,
    name: 'Gateway MQTT MV Batam Express',
    kind: 'mqtt',
    apiKeyId: null,
    status: 'inactive',
    serialNumber: null,
    mqttTopic: 'aisits/telemetry/0192f0c8-7d3a-7c2e-9a34-000000000002',
    lastSeenAt: null,
    createdBy: TEST_IDS.user,
    createdAt: AT,
    updatedAt: AT,
  },
];

export const VESSEL_TYPES: VesselTypeDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a1c-000000000001',
    code: 'bulk_carrier',
    name: 'Bulk carrier',
    capacityUnit: 'DWT',
    a: 4745,
    c: 0.622,
    capacityFixed: null,
    d: { d1: 0.86, d2: 0.94, d3: 1.06, d4: 1.18 },
    icon: 'bulkca',
    source: 'IMO MEPC.353(78), MEPC.354(78)',
    referenceIds: [],
    createdAt: AT,
    updatedAt: AT,
  },
];

export const FUELS: FuelDto[] = [
  {
    id: '0192f0c8-7d3a-7c2e-9a21-000000000001',
    code: 'diesel_gas_oil',
    name: 'Diesel / gas oil',
    carbonContent: 0.8744,
    conversionFactor: 3.206,
    density: 0.86,
    source: 'IMO MEPC.364(79)',
    referenceIds: [],
    createdAt: AT,
    updatedAt: AT,
  },
];

export const ENGINES: EngineDto[] = [];
export const FORMULAS: FuelFormulaDto[] = [];
export const PORTS: PortDto[] = [];

/** The vessels of the organization (device form, names of the device list). */
export function mockVessels() {
  server.use(
    http.get('*/api/v2/vessels', () =>
      HttpResponse.json(
        page([
          {
            view: 'summary',
            id: '0192f0c8-7d3a-7c2e-9a1b-000525005223',
            mmsi: 525005223,
            imo: null,
            name: 'KM Bahari Nusantara',
            flag: 'ID',
            type: null,
            status: 'active',
            photoUrl: null,
            updatedAt: AT,
          },
          {
            view: 'summary',
            id: '0192f0c8-7d3a-7c2e-9a1b-000525019001',
            mmsi: 525019001,
            imo: null,
            name: 'MV Batam Express',
            flag: 'ID',
            type: null,
            status: 'active',
            photoUrl: null,
            updatedAt: AT,
          },
        ]),
      ),
    ),
  );
}
