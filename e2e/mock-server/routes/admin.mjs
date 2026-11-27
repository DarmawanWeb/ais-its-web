// Administration mock (feature `admin`): the auth service's organizations, members and
// invitations, user directory, API keys and central audit log (services/auth/README.md), the
// fleet reference data with writes (services/fleet/README.md; same ids and codes as the
// read-only fallbacks of routes/vessels.mjs, whose RegExp routes these plain paths take
// precedence over) and the telemetry device registry (services/telemetry/README.md).
// Mutations append audit records, so the audit log reflects what an e2e run did.
import { randomBytes, randomUUID } from 'node:crypto';

import { vesselTypeOf } from '../base/fleet.mjs';
import {
  can,
  cursorPageOf,
  DEMO_CREATED_AT,
  FLEET_ORG_ID,
  MockHttpError,
  nowIso,
  organizationOf,
  ORGS,
  pageOf,
  USERS,
  VESSELS,
} from '../lib.mjs';

const [FLEET, KSOP, PLATFORM] = ORGS.map((org) => org.id);
const ORG_KINDS = ['shipping_company', 'authority', 'research', 'platform'];
const ROLES = ['org_admin', 'fleet_manager', 'authority', 'viewer'];
const SCOPES = ['ais:ingest', 'telemetry:ingest', 'ais:read'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const ahead = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const id = (group, n) => `0192f0c8-7d3a-7c2e-9a3${group}-${String(n).padStart(12, '0')}`;
const invalid = (errors) =>
  new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', { errors });
const isSuper = (claims) => (claims.roles ?? []).includes('super_admin');

// --- seed data ------------------------------------------------------------------------------

const EXTRA_ORGS = [
  {
    id: id(0, 4),
    name: 'PT Samudera Logistik Indonesia',
    slug: 'samudera-logistik',
    kind: 'shipping_company',
  },
  { id: id(0, 5), name: 'Pusat Riset Kelautan ITS', slug: 'riset-kelautan-its', kind: 'research' },
  { id: id(0, 6), name: 'Pangkalan PLP Tanjung Uban', slug: 'plp-tanjung-uban', kind: 'authority' },
];

/** Directory accounts: the two demo logins plus colleagues (cannot sign in to the mock). */
const SEED_USERS = () => [
  { ...pick(USERS[0]), mfaEnabled: true, lastLoginAt: ago(3), isPlatformAdmin: true },
  { ...pick(USERS[1]), mfaEnabled: false, lastLoginAt: ago(95), isPlatformAdmin: false },
  user(1, 'Sari Wulandari', 'sari.wulandari@pelni.test', {
    mfaEnabled: true,
    lastLoginAt: ago(240),
  }),
  user(2, 'Budi Santoso', 'budi.santoso@pelni.test', { lastLoginAt: ago(2 * 1440) }),
  user(3, 'Rudi Hartono', 'rudi.hartono@pelni.test', {
    status: 'disabled',
    lastLoginAt: ago(45 * 1440),
  }),
  user(4, 'Andi Pratama', 'andi.pratama@ksop-batam.go.id', {
    mfaEnabled: true,
    lastLoginAt: ago(60),
  }),
  user(5, 'Maya Lestari', 'maya.lestari@ksop-batam.go.id', {
    mfaEnabled: true,
    lastLoginAt: ago(600),
  }),
  user(6, 'Hendra Wijaya', 'hendra.wijaya@ksop-batam.go.id', { lastLoginAt: ago(3 * 1440) }),
  user(7, 'Fajar Nugroho', 'fajar.nugroho@samudera-logistik.co.id', { lastLoginAt: ago(5 * 1440) }),
  user(8, 'Lina Kartika', 'lina.kartika@its.ac.id', {
    mfaEnabled: true,
    lastLoginAt: ago(9 * 1440),
  }),
  user(9, 'Teguh Prasetyo', 'teguh.prasetyo@ais-its.local', { lastLoginAt: ago(30) }),
  user(10, 'Yusuf Maulana', 'yusuf.maulana@pelni.test', { status: 'invited', lastLoginAt: null }),
  user(11, 'Agus Salim', 'agus.salim@pelni.test', { status: 'invited', lastLoginAt: null }),
];

function pick(demo) {
  return {
    id: demo.id,
    email: demo.email,
    name: demo.name,
    status: 'active',
    createdAt: DEMO_CREATED_AT,
  };
}

function user(n, name, email, extra) {
  return {
    id: id(1, n),
    email,
    name,
    status: 'active',
    mfaEnabled: false,
    isPlatformAdmin: false,
    createdAt: DEMO_CREATED_AT,
    ...extra,
  };
}

const SEED_MEMBERSHIPS = () => [
  ...USERS.flatMap((u) =>
    u.memberships.map((m) => ({ userId: u.id, ...m, joinedAt: DEMO_CREATED_AT })),
  ),
  { userId: id(1, 1), orgId: FLEET, role: 'fleet_manager', joinedAt: ago(20 * 1440) },
  { userId: id(1, 2), orgId: FLEET, role: 'viewer', joinedAt: ago(12 * 1440) },
  { userId: id(1, 3), orgId: FLEET, role: 'viewer', joinedAt: ago(90 * 1440) },
  { userId: id(1, 4), orgId: KSOP, role: 'org_admin', joinedAt: ago(60 * 1440) },
  { userId: id(1, 5), orgId: KSOP, role: 'authority', joinedAt: ago(40 * 1440) },
  { userId: id(1, 6), orgId: KSOP, role: 'authority', joinedAt: ago(15 * 1440) },
  { userId: id(1, 7), orgId: id(0, 4), role: 'org_admin', joinedAt: ago(8 * 1440) },
  { userId: id(1, 8), orgId: id(0, 5), role: 'org_admin', joinedAt: ago(30 * 1440) },
  { userId: id(1, 9), orgId: PLATFORM, role: 'viewer', joinedAt: ago(70 * 1440) },
];

const SEED_INVITATIONS = () => [
  invitation(
    1,
    FLEET,
    id(1, 10),
    'Yusuf Maulana',
    'yusuf.maulana@pelni.test',
    'fleet_manager',
    ago(1440),
    ahead(6 * 1440),
  ),
  invitation(
    2,
    FLEET,
    id(1, 11),
    'Agus Salim',
    'agus.salim@pelni.test',
    'viewer',
    ago(9 * 1440),
    ago(2 * 1440),
  ),
];

function invitation(n, orgId, userId, name, email, role, createdAt, expiresAt) {
  return {
    id: id(2, n),
    orgId,
    userId,
    name,
    email,
    role,
    invitedBy: USERS[0].id,
    createdAt,
    expiresAt,
  };
}

const SEED_KEYS = () => [
  apiKey(1, FLEET, 'Flow meter KM Bahari Nusantara', ['telemetry:ingest'], {
    lastUsedAt: ago(2),
    createdAt: ago(30 * 1440),
  }),
  apiKey(2, FLEET, 'Integrasi dasbor armada', ['ais:read'], {
    lastUsedAt: ago(1440),
    createdAt: ago(25 * 1440),
  }),
  apiKey(3, FLEET, 'Flow meter MT Selat Jaya (lama)', ['telemetry:ingest'], {
    lastUsedAt: ago(12 * 1440),
    revokedAt: ago(10 * 1440),
    createdAt: ago(80 * 1440),
  }),
  apiKey(4, FLEET, 'Flow meter AE KM Rempang', ['telemetry:ingest'], { createdAt: ago(2 * 1440) }),
  apiKey(5, PLATFORM, 'Pusher AIS Selat Singapura', ['ais:ingest'], {
    lastUsedAt: ago(0.2),
    createdAt: ago(60 * 1440),
  }),
  apiKey(6, KSOP, 'Integrasi SIMOPEL', ['ais:read'], {
    lastUsedAt: ago(300),
    createdAt: ago(45 * 1440),
    createdBy: id(1, 4),
  }),
];

function apiKey(n, orgId, name, scopes, extra) {
  return {
    id: id(3, n),
    orgId,
    name,
    prefix: `sk_${randomBytes(8).toString('base64url').slice(0, 10)}`,
    scopes,
    createdBy: USERS[0].id,
    lastUsedAt: null,
    revokedAt: null,
    ...extra,
  };
}

const SEED_DEVICES = () => [
  device(1, 525005223, 'Flow meter ME KM Bahari Nusantara', 'http', {
    apiKeyId: id(3, 1),
    serialNumber: 'FM-2207-0042',
    lastSeenAt: ago(2),
  }),
  device(2, 525019001, 'Gateway MQTT MV Batam Express', 'mqtt', {
    serialNumber: 'GW-A1-7781',
    lastSeenAt: ago(190),
  }),
  device(3, 525019003, 'Gateway MQTT KM Kepri Indah', 'mqtt', { lastSeenAt: ago(3 * 1440) }),
  device(4, 525019002, 'Flow meter AE MT Selat Jaya', 'http', {
    apiKeyId: id(3, 3),
    status: 'inactive',
    serialNumber: 'FM-1903-0007',
    lastSeenAt: ago(12 * 1440),
  }),
  device(5, 525019005, 'Gateway MQTT LNG Natuna', 'mqtt', { serialNumber: 'GW-B2-0193' }),
];

function device(n, mmsi, name, kind, extra) {
  const deviceId = id(4, n);
  return {
    id: deviceId,
    orgId: FLEET,
    mmsi,
    name,
    kind,
    apiKeyId: null,
    status: 'active',
    serialNumber: null,
    mqttTopic: kind === 'mqtt' ? `aisits/telemetry/${deviceId}` : null,
    lastSeenAt: null,
    createdBy: USERS[0].id,
    createdAt: ago(40 * 1440),
    updatedAt: ago(5 * 1440),
    ...extra,
  };
}

// Reference data: identical ids, codes and values to routes/vessels.mjs (vessel forms keep working).
const AT = '2026-11-01T00:00:00.000Z';
const refId = (group, n) => `0192f0c8-7d3a-7c2e-9a2${group}-${String(n).padStart(12, '0')}`;
const CII_PARAMS = {
  tanker: ['DWT', 5247, 0.61, [0.82, 0.93, 1.08, 1.28], 'tanker'],
  ro_ro_passenger_ship: ['GT', 2023, 0.46, [0.72, 0.9, 1.12, 1.41], 'ro-rop'],
  general_cargo_ship: ['DWT', 31948, 0.792, [0.83, 0.94, 1.06, 1.19], 'genera'],
  container_ship: ['DWT', 1984, 0.489, [0.83, 0.94, 1.07, 1.19], 'contai'],
  refrigerated_cargo_carrier: ['DWT', 4600, 0.557, [0.78, 0.91, 1.07, 1.2], 'refrig'],
  bulk_carrier: ['DWT', 4745, 0.622, [0.86, 0.94, 1.06, 1.18], 'bulkca'],
  lng_carrier: ['DWT', 144050e10, 2.071, [0.89, 0.98, 1.06, 1.13], 'lngcar'],
  ro_ro_cargo_ship_vc: ['GT', 5739, 0.631, [0.86, 0.94, 1.06, 1.16], 'ro-rov'],
  gas_carrier: ['DWT', 8104, 0.639, [0.81, 0.91, 1.12, 1.44], 'gascar'],
  cruise_passenger_ship: ['GT', 930, 0.383, [0.87, 0.95, 1.06, 1.16], 'cruise'],
  combination_carrier: ['DWT', 40853, 0.812, [0.87, 0.96, 1.06, 1.14], 'combin'],
  unknown: ['GT', 31948, 0.792, [0.83, 0.94, 1.06, 1.19], 'unknown'],
};
const SEED_REFERENCE = () => ({
  'vessel-types': Object.entries(CII_PARAMS).map(
    ([code, [capacityUnit, a, c, [d1, d2, d3, d4], icon]]) => ({
      ...vesselTypeOf(code),
      icon,
      capacityUnit,
      a,
      c,
      capacityFixed: null,
      d: { d1, d2, d3, d4 },
      source: 'IMO MEPC.353(78), MEPC.354(78)',
      createdAt: AT,
      updatedAt: AT,
    }),
  ),
  fuels: [
    ['diesel_gas_oil', 'Diesel / gas oil', 0.8744, 3.206, 0.86],
    ['hfo', 'Heavy fuel oil (HFO)', 0.8493, 3.114, 0.98],
    ['lfo', 'Light fuel oil (LFO)', 0.8594, 3.151, 0.94],
    ['lng', 'Liquefied natural gas (LNG)', 0.75, 2.75, 0.45],
  ].map(([code, name, carbonContent, conversionFactor, density], index) => ({
    id: refId(1, index + 1),
    code,
    name,
    carbonContent,
    conversionFactor,
    density,
    source: 'IMO MEPC.364(79)',
    createdAt: AT,
    updatedAt: AT,
  })),
  engines: [
    ['niigata_6m28bet', 'main', 'NIIGATA 6M28BET', 390, 2100, 179.2],
    ['man_bw_6s50me', 'main', 'MAN B&W 6S50ME-C', 127, 9960, 167],
    ['wartsila_8l32', 'main', 'Wärtsilä 8L32', 750, 4640, 178],
    ['man_d2866le', 'auxiliary', 'MAN D2866LE', 1800, 276, 207],
    ['cummins_kta19', 'auxiliary', 'Cummins KTA19-D(M)', 1800, 448, 211],
    ['yanmar_6ey18', 'auxiliary', 'Yanmar 6EY18ALW', 900, 600, 198],
  ].map(([code, kind, name, rpm, powerKw, sfoc], index) => ({
    id: refId(2, index + 1),
    code,
    kind,
    name,
    rpm,
    powerKw,
    sfoc,
    source: null,
    createdAt: AT,
    updatedAt: AT,
  })),
  'fuel-formulas': [
    {
      id: refId(3, 1),
      code: 'dharma_ferry_viii',
      name: 'Dharma Ferry VIII',
      mainEngineFormula: '-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197',
      auxiliaryEngineFormula: '1.5103 * Math.exp(-0.064 * speedKnot)',
      source: 'thesis — needs citation',
      createdAt: AT,
      updatedAt: AT,
    },
  ],
  ports: [
    ['IDBTH', 'Batu Ampar', 'Kota Batam, Kepulauan Riau', 104.006, 1.163],
    ['IDSKP', 'Sekupang', 'Kota Batam, Kepulauan Riau', 103.94, 1.115],
    ['IDTPP', 'Tanjung Priok', 'Jakarta Utara, DKI Jakarta', 106.885, -6.104],
    ['IDPDB', 'Padang Bai', 'Karangasem, Bali', 115.51, -8.53],
    ['IDLEM', 'Lembar', 'Lombok Barat, NTB', 116.07, -8.73],
    ['SGPSP', 'Pasir Panjang', 'Singapore', 103.765, 1.272],
  ].map(([code, name, administrativeLocation, lon, lat], index) => ({
    id: refId(4, index + 1),
    name,
    code,
    administrativeLocation,
    location: { type: 'Point', coordinates: [lon, lat] },
    radiusM: 1500,
    source: null,
    createdAt: AT,
    updatedAt: AT,
  })),
});
/** Reference rows used by the demo vessels (`409 REFERENCE_IN_USE` on delete). */
const IN_USE = new Set([
  ...Object.keys(CII_PARAMS).map((code) => vesselTypeOf(code).id),
  refId(1, 1),
  refId(1, 2),
  refId(2, 1),
  refId(2, 4),
  refId(3, 1),
  refId(4, 1),
  refId(4, 2),
]);
/** Vessels of shipping companies that are not a demo login's organization (routes/vessels.mjs). */
const FOREIGN_MMSIS = new Set([563012345, 563045678, 538007788, 636019900]);

// --- state ----------------------------------------------------------------------------------

let orgs;
let users;
let memberships;
let invitations;
let apiKeys;
let devices;
let reference;
let audit;
let sequence;

export function reset() {
  orgs = [...ORGS, ...EXTRA_ORGS].map(organizationOf);
  users = SEED_USERS();
  memberships = SEED_MEMBERSHIPS();
  invitations = SEED_INVITATIONS();
  apiKeys = SEED_KEYS().map((key) => ({ createdAt: ago(10 * 1440), ...key }));
  devices = SEED_DEVICES();
  reference = SEED_REFERENCE();
  audit = seedAudit();
  sequence = 100;
}

// --- audit ----------------------------------------------------------------------------------

const ADMIN_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function seedAudit() {
  const admin = USERS[0].id;
  const manager = USERS[1].id;
  const rows = [
    [2, 'auth', 'user', admin, PLATFORM, 'auth.login.succeeded', 'session', null, { mfa: true }],
    [
      8,
      'telemetry',
      'api_key',
      id(3, 1),
      FLEET,
      'fuel_reading.create',
      'vessel',
      '525005223',
      { received: 6, accepted: 6, duplicates: 0 },
    ],
    [
      35,
      'notification',
      'user',
      manager,
      FLEET,
      'alert.acknowledge',
      'alert',
      randomUUID(),
      { type: 'safety.ews.danger', note: 'Kapal sudah dihubungi via VHF kanal 16' },
    ],
    [95, 'auth', 'user', manager, FLEET, 'auth.login.succeeded', 'session', null, { mfa: false }],
    [
      130,
      'fleet',
      'user',
      manager,
      FLEET,
      'vessel.update',
      'vessel',
      '525019001',
      { fields: ['status', 'annualVoyagePercentage'] },
    ],
    [
      180,
      'auth',
      'user',
      admin,
      FLEET,
      'membership.update',
      'user',
      id(1, 1),
      { from: 'viewer', to: 'fleet_manager' },
    ],
    [
      240,
      'auth',
      'user',
      null,
      FLEET,
      'auth.login.failed',
      'user',
      null,
      { email: 'rina.nakhoda@pelni.test', reason: 'INVALID_CREDENTIALS' },
    ],
    [
      300,
      'notification',
      'user',
      manager,
      FLEET,
      'alert_rule.update',
      'alert_rule',
      randomUUID(),
      {
        changes: {
          minSeverity: { from: 'info', to: 'warning' },
          enabled: { from: false, to: true },
        },
      },
    ],
    [
      420,
      'auth',
      'user',
      admin,
      FLEET,
      'api_key.create',
      'api_key',
      id(3, 4),
      { name: 'Flow meter AE KM Rempang', scopes: ['telemetry:ingest'] },
    ],
    [
      600,
      'telemetry',
      'user',
      admin,
      FLEET,
      'device.create',
      'device',
      id(4, 5),
      { name: 'Gateway MQTT LNG Natuna', kind: 'mqtt', mmsi: 525019005 },
    ],
    [
      900,
      'geo',
      'user',
      manager,
      FLEET,
      'zone.update',
      'zone',
      randomUUID(),
      {
        before: { name: 'Alur Batu Ampar', bufferM: 300 },
        after: { name: 'Alur Pelayaran Batu Ampar', bufferM: 500 },
      },
    ],
    [
      1440,
      'auth',
      'user',
      admin,
      FLEET,
      'membership.invite',
      'membership_invitation',
      id(2, 1),
      { role: 'fleet_manager' },
    ],
    [
      1500,
      'auth',
      'user',
      admin,
      PLATFORM,
      'organization.update',
      'organization',
      KSOP,
      { before: { name: 'KSOP Kelas I Batam' }, after: { name: 'KSOP Batam' } },
    ],
    [
      2000,
      'auth',
      'user',
      id(1, 4),
      KSOP,
      'membership.update',
      'user',
      id(1, 6),
      { from: 'viewer', to: 'authority' },
    ],
    [
      2880,
      'fleet',
      'user',
      admin,
      null,
      'fuel_formula.update',
      'fuel_formula',
      refId(3, 1),
      { fields: ['auxiliaryEngineFormula'] },
    ],
    [
      4000,
      'auth',
      'user',
      admin,
      FLEET,
      'user.status.update',
      'user',
      id(1, 3),
      { from: 'active', to: 'disabled' },
    ],
    [
      5000,
      'auth',
      'system',
      null,
      null,
      'auth.signing_key.rotate',
      'signing_key',
      'Q3ld5h0x',
      { previousKid: 'Bf8vA2pq' },
    ],
    [7200, 'auth', 'user', manager, FLEET, 'auth.mfa.disable', 'user', manager, {}],
    [
      10080,
      'auth',
      'user',
      admin,
      FLEET,
      'api_key.revoke',
      'api_key',
      id(3, 3),
      { name: 'Flow meter MT Selat Jaya (lama)' },
    ],
    [
      14400,
      'auth',
      'user',
      admin,
      PLATFORM,
      'organization.create',
      'organization',
      id(0, 4),
      { name: 'PT Samudera Logistik Indonesia', kind: 'shipping_company' },
    ],
  ];
  return rows.map(
    ([minutes, source, actorType, actorId, orgId, action, targetType, targetId, meta], index) => ({
      id: id(5, index + 1),
      at: ago(minutes),
      source,
      actorType,
      actorId,
      orgId,
      action,
      targetType,
      targetId,
      ip:
        actorType === 'user'
          ? actorId === manager
            ? '103.47.132.18'
            : '36.85.110.4'
          : actorType === 'api_key'
            ? '182.253.71.90'
            : null,
      userAgent:
        actorType === 'user' ? ADMIN_UA : actorType === 'api_key' ? 'flowmeter-gw/2.4.1' : null,
      meta,
    }),
  );
}

/** Appends the audit record of a mutation (newest first). */
function record(claims, req, action, orgId, targetType, targetId, meta = {}) {
  audit.unshift({
    id: randomUUID(),
    at: nowIso(),
    source: action.startsWith('device')
      ? 'telemetry'
      : /^(vessel|fuel|engine|port)/.test(action)
        ? 'fleet'
        : 'auth',
    actorType: 'user',
    actorId: claims.sub ?? null,
    orgId,
    action,
    targetType,
    targetId,
    ip: '127.0.0.1',
    userAgent: req.headers['user-agent'] ?? null,
    meta,
  });
}

// --- helpers --------------------------------------------------------------------------------

function findOrg(orgId) {
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw new MockHttpError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
  return org;
}

/** `user:manage` on the caller's active organization (super_admin: any). */
function manageOrg(claims, orgId) {
  if (!can(claims, 'user:manage') || (!isSuper(claims) && claims.org !== orgId)) {
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
  }
  return findOrg(orgId);
}

const memberOf = (m) => {
  const u = users.find((x) => x.id === m.userId);
  return {
    userId: m.userId,
    email: u.email,
    name: u.name,
    status: u.status,
    role: m.role,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt,
    joinedAt: m.joinedAt,
  };
};

const invitationOf = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  invitedBy: row.invitedBy,
  invitedByName: users.find((u) => u.id === row.invitedBy)?.name ?? null,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  expired: Date.parse(row.expiresAt) < Date.now(),
});

const directoryOf = (u) => ({
  ...u,
  updatedAt: u.updatedAt ?? u.createdAt,
  memberships: memberships
    .filter((m) => m.userId === u.id)
    .map(({ orgId, role }) => ({ orgId, role })),
});

const keyOf = (key) => ({
  expiresAt: null,
  rotatedAt: null,
  previousKeyExpiresAt: null,
  ...key,
  status: key.revokedAt
    ? 'revoked'
    : key.expiresAt && Date.parse(key.expiresAt) <= Date.now()
      ? 'expired'
      : 'active',
});

/** Audit record with the names auth 0.2 captures (actorName, actorEmail, orgName, targetLabel). */
const auditOf = (row) => {
  const actor = row.actorType === 'user' ? users.find((u) => u.id === row.actorId) : null;
  const key = row.actorType === 'api_key' ? apiKeys.find((k) => k.id === row.actorId) : null;
  const targetUser = row.targetType === 'user' ? users.find((u) => u.id === row.targetId) : null;
  const targetOrg =
    row.targetType === 'organization' ? orgs.find((o) => o.id === row.targetId) : null;
  return {
    ...row,
    actorName: row.actorName ?? actor?.name ?? key?.name ?? null,
    actorEmail: row.actorEmail ?? actor?.email ?? null,
    orgName: row.orgName ?? orgs.find((o) => o.id === row.orgId)?.name ?? null,
    targetLabel:
      row.targetLabel ??
      (targetUser
        ? `${targetUser.name} <${targetUser.email}>`
        : (targetOrg?.name ?? row.meta?.targetLabel ?? row.meta?.name ?? null)),
  };
};

function assertRole(org, role) {
  if (!ROLES.includes(role))
    throw invalid([{ field: 'role', code: 'isIn', message: 'role must be a valid role' }]);
  if (role === 'authority' && org.kind !== 'authority') {
    throw new MockHttpError(422, 'ROLE_NOT_GRANTABLE', 'Role not grantable', {
      detail: 'authority can only be granted in organizations of kind authority',
    });
  }
}

const lastAdmin = (orgId, userId) =>
  memberships.filter((m) => m.orgId === orgId && m.role === 'org_admin' && m.userId !== userId)
    .length === 0;

function searchOf(url) {
  return (url.searchParams.get('search') ?? '').trim().toLowerCase();
}

/** Tenant scope of telemetry and API keys: own org, or (super_admin) `orgId` / all. */
function scopeOrg(claims, url) {
  const requested = url.searchParams.get('orgId');
  if (isSuper(claims)) return requested || null;
  if (requested && requested !== claims.org) throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
  if (!claims.org) throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'Organization required');
  return claims.org;
}

// --- reference data -------------------------------------------------------------------------

const CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const FORMULA_NAMES = /^(?:Math\.)?(?:exp|log|ln|sqrt|pow|abs|min|max)$|^speedKnot$/;

/** Light server-side check of the safe formula grammar (the editor checks the full grammar). */
function formulaProblem(text) {
  if (typeof text !== 'string' || !text.trim()) return 'formula must not be empty';
  if (text.length > 500) return 'formula is longer than 500 characters';
  const bad = /[^0-9a-zA-Z_.+\-*/^(), \t]/.exec(text);
  if (bad) return `unexpected "${bad[0]}" at position ${bad.index + 1}`;
  for (const match of text.matchAll(/[A-Za-z_][A-Za-z_.]*/g)) {
    if (!FORMULA_NAMES.test(match[0]))
      return `unknown name "${match[0]}" at position ${match.index + 1}`;
  }
  return null;
}

const REFERENCE = {
  'vessel-types': {
    name: 'Vessel type',
    notFound: 'VESSEL_TYPE_NOT_FOUND',
    group: 5,
    validate(input, current) {
      const v = { ...current, ...input };
      const errors = [];
      if (!CODE.test(v.code ?? ''))
        errors.push({ field: 'code', code: 'matches', message: 'code must be lower_snake_case' });
      if (!v.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      if (!['DWT', 'GT'].includes(v.capacityUnit))
        errors.push({
          field: 'capacityUnit',
          code: 'isIn',
          message: 'capacityUnit must be DWT or GT',
        });
      if (!(v.a > 0))
        errors.push({ field: 'a', code: 'isPositive', message: 'a must be positive' });
      const d = v.d ?? {};
      if (!(d.d1 < d.d2 && d.d2 < d.d3 && d.d3 < d.d4))
        errors.push({ field: 'd', code: 'ddOrder', message: 'd1 < d2 < d3 < d4' });
      return errors;
    },
  },
  fuels: {
    name: 'Fuel',
    notFound: 'FUEL_NOT_FOUND',
    group: 6,
    validate(input, current) {
      const v = { ...current, ...input };
      const errors = [];
      if (!CODE.test(v.code ?? ''))
        errors.push({ field: 'code', code: 'matches', message: 'code must be lower_snake_case' });
      if (!v.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      if (!(v.carbonContent > 0 && v.carbonContent <= 1))
        errors.push({
          field: 'carbonContent',
          code: 'max',
          message: 'carbonContent must be in (0, 1]',
        });
      if (!(v.conversionFactor > 0))
        errors.push({
          field: 'conversionFactor',
          code: 'isPositive',
          message: 'conversionFactor must be positive',
        });
      if (!(v.density > 0))
        errors.push({ field: 'density', code: 'isPositive', message: 'density must be positive' });
      return errors;
    },
  },
  engines: {
    name: 'Engine',
    notFound: 'ENGINE_NOT_FOUND',
    group: 7,
    validate(input, current) {
      const v = { ...current, ...input };
      const errors = [];
      if (!['main', 'auxiliary'].includes(v.kind))
        errors.push({ field: 'kind', code: 'isIn', message: 'kind must be main or auxiliary' });
      if (!v.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      for (const field of ['rpm', 'powerKw', 'sfoc']) {
        if (!(v[field] > 0))
          errors.push({ field, code: 'isPositive', message: `${field} must be positive` });
      }
      return errors;
    },
  },
  'fuel-formulas': {
    name: 'Fuel formula',
    notFound: 'FUEL_FORMULA_NOT_FOUND',
    group: 8,
    validate(input, current) {
      const v = { ...current, ...input };
      const errors = [];
      if (!v.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      for (const field of ['mainEngineFormula', 'auxiliaryEngineFormula']) {
        const problem = formulaProblem(v[field]);
        if (problem) errors.push({ field, code: 'formula', message: problem });
      }
      return errors;
    },
  },
  ports: {
    name: 'Port',
    notFound: 'PORT_NOT_FOUND',
    group: 9,
    validate(input, current) {
      const v = { ...current, ...input };
      const errors = [];
      if (!/^[A-Z0-9]{2,16}$/.test(v.code ?? ''))
        errors.push({ field: 'code', code: 'matches', message: 'code must match [A-Z0-9]{2,16}' });
      if (!v.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      const [lon, lat] = v.location?.coordinates ?? [];
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
        errors.push({
          field: 'location',
          code: 'isLonLat',
          message: 'location must be a WGS 84 point',
        });
      }
      return errors;
    },
  },
};

const NULLABLE = new Set([
  'capacityFixed',
  'icon',
  'source',
  'code',
  'administrativeLocation',
  'radiusM',
]);

function referenceRoutes(resource) {
  const spec = REFERENCE[resource];
  const base = `/api/v2/${resource}`;
  const find = (rowId) => {
    const row = reference[resource].find((r) => r.id === rowId);
    if (!row) throw new MockHttpError(404, spec.notFound, `${spec.name} not found`);
    return row;
  };
  const assertCode = (code, rowId) => {
    if (code && reference[resource].some((r) => r.code === code && r.id !== rowId)) {
      throw new MockHttpError(409, 'CODE_ALREADY_EXISTS', 'Code already exists', {
        detail: `code ${code} is taken`,
      });
    }
  };
  const check = (input, current) => {
    for (const [key, value] of Object.entries(input)) {
      if (value === null && !NULLABLE.has(key))
        throw invalid([{ field: key, code: 'isDefined', message: `${key} must not be null` }]);
    }
    const errors = spec.validate(input, current);
    if (errors.length) throw invalid(errors);
  };
  return [
    {
      method: 'GET',
      path: base,
      permission: 'vessel:read',
      handler: ({ url, send }) => {
        const term = searchOf(url);
        const kind = url.searchParams.get('kind');
        const rows = reference[resource].filter(
          (row) =>
            (!term ||
              row.name.toLowerCase().includes(term) ||
              (row.code ?? '').toLowerCase().includes(term)) &&
            (!kind || row.kind === kind),
        );
        send(200, pageOf(rows, url));
      },
    },
    {
      method: 'GET',
      path: `${base}/:id`,
      permission: 'vessel:read',
      handler: ({ params, send }) => send(200, find(params.id)),
    },
    {
      method: 'POST',
      path: base,
      permission: 'reference:write',
      handler: async ({ claims, req, body, send }) => {
        const input = await body();
        check(input, {});
        assertCode(input.code);
        const row = {
          code: null,
          source: null,
          ...(resource === 'vessel-types' ? { capacityFixed: null, icon: null } : {}),
          ...(resource === 'ports' ? { administrativeLocation: null, radiusM: null } : {}),
          ...input,
          id: refId(spec.group, (sequence += 1)),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        reference[resource].push(row);
        record(claims, req, `${auditName(resource)}.create`, null, auditName(resource), row.id, {
          name: row.name,
        });
        send(201, row);
      },
    },
    {
      method: 'PATCH',
      path: `${base}/:id`,
      permission: 'reference:write',
      handler: async ({ claims, req, params, body, send }) => {
        const row = find(params.id);
        const input = await body();
        check(input, row);
        assertCode(input.code, row.id);
        Object.assign(row, input, { updatedAt: nowIso() });
        record(claims, req, `${auditName(resource)}.update`, null, auditName(resource), row.id, {
          fields: Object.keys(input),
        });
        send(200, row);
      },
    },
    {
      method: 'DELETE',
      path: `${base}/:id`,
      permission: 'reference:write',
      handler: ({ claims, req, params, send }) => {
        const row = find(params.id);
        if (IN_USE.has(row.id)) {
          throw new MockHttpError(409, 'REFERENCE_IN_USE', 'Reference in use', {
            detail: `${spec.name} is used by vessels`,
          });
        }
        reference[resource] = reference[resource].filter((r) => r.id !== row.id);
        record(claims, req, `${auditName(resource)}.delete`, null, auditName(resource), row.id, {
          name: row.name,
        });
        send(204);
      },
    },
  ];
}

/** Audit action prefix and target type of a reference resource (`vessel-types` → `vessel_type`). */
function auditName(resource) {
  return {
    'vessel-types': 'vessel_type',
    fuels: 'fuel',
    engines: 'engine',
    'fuel-formulas': 'fuel_formula',
    ports: 'port',
  }[resource];
}

// --- routes ---------------------------------------------------------------------------------

/** Audit records of the listing filters (spec: exact action, actorEmail, actionPrefix). */
function auditRows(claims, url, { ignoreAction = false } = {}) {
  const q = url.searchParams;
  const orgId = isSuper(claims) ? q.get('orgId') : claims.org;
  const to = q.get('to') ? Date.parse(q.get('to')) : Date.now() + 60_000;
  const from = q.get('from') ? Date.parse(q.get('from')) : to - 30 * 1440 * 60_000;
  if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
    throw invalid([{ field: 'from', code: 'isBefore', message: 'from must be before to' }]);
  }
  const email = q.get('actorEmail')?.toLowerCase();
  return audit.filter((r) => {
    const at = Date.parse(r.at);
    return (
      at >= from &&
      at < to &&
      (!orgId || r.orgId === orgId) &&
      (!q.get('actorId') || r.actorId === q.get('actorId')) &&
      (ignoreAction || !q.get('action') || r.action === q.get('action')) &&
      (!q.get('actionPrefix') || r.action.startsWith(q.get('actionPrefix'))) &&
      (!email || (auditOf(r).actorEmail ?? '').toLowerCase() === email) &&
      (!q.get('targetType') || r.targetType === q.get('targetType')) &&
      (!q.get('targetId') || r.targetId === q.get('targetId'))
    );
  });
}

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  // Organizations (org:manage = super_admin).
  {
    method: 'GET',
    path: '/api/v2/organizations/stats',
    permission: 'org:manage',
    handler: ({ url, send }) => {
      const term = searchOf(url);
      const rows = orgs.filter(
        (o) => !term || o.name.toLowerCase().includes(term) || o.slug.includes(term),
      );
      send(200, {
        total: rows.length,
        byKind: Object.fromEntries(
          ORG_KINDS.map((kind) => [kind, rows.filter((o) => o.kind === kind).length]),
        ),
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/organizations',
    permission: 'org:manage',
    handler: ({ url, send }) => {
      const term = searchOf(url);
      const kind = url.searchParams.get('kind');
      if (kind && !ORG_KINDS.includes(kind))
        throw invalid([{ field: 'kind', code: 'isIn', message: 'invalid kind' }]);
      const rows = orgs
        .filter(
          (o) =>
            (!term || o.name.toLowerCase().includes(term) || o.slug.includes(term)) &&
            (!kind || o.kind === kind),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      send(
        200,
        pageOf(
          rows.map((o) => ({
            ...o,
            memberCount: memberships.filter((m) => m.orgId === o.id).length,
            apiKeyCount: apiKeys.filter((k) => k.orgId === o.id && keyOf(k).status === 'active')
              .length,
          })),
          url,
        ),
      );
    },
  },
  {
    method: 'POST',
    path: '/api/v2/organizations',
    permission: 'org:manage',
    handler: async ({ claims, req, body, send }) => {
      const input = await body();
      const errors = [];
      if (!input.name?.trim() || input.name.length > 200)
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      if (!ORG_KINDS.includes(input.kind))
        errors.push({ field: 'kind', code: 'isIn', message: 'invalid kind' });
      const slug = input.slug ?? slugify(input.name ?? '');
      if (!SLUG.test(slug) || slug.length > 63)
        errors.push({ field: 'slug', code: 'matches', message: 'slug must be a DNS label' });
      if (errors.length) throw invalid(errors);
      if (orgs.some((o) => o.slug === slug))
        throw new MockHttpError(409, 'ORGANIZATION_SLUG_TAKEN', 'Slug taken');
      const org = {
        id: randomUUID(),
        name: input.name.trim(),
        slug,
        kind: input.kind,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      orgs.push(org);
      record(claims, req, 'organization.create', org.id, 'organization', org.id, {
        name: org.name,
        kind: org.kind,
      });
      send(201, org);
    },
  },
  {
    method: 'GET',
    path: '/api/v2/organizations/:id',
    handler: ({ claims, params, send }) => {
      const org = orgs.find((o) => o.id === params.id);
      const member = memberships.some((m) => m.orgId === params.id && m.userId === claims.sub);
      if (!org || !(can(claims, 'org:manage') || member)) {
        throw new MockHttpError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
      }
      send(200, org);
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/organizations/:id',
    permission: 'org:manage',
    handler: async ({ claims, req, params, body, send }) => {
      const org = findOrg(params.id);
      const input = await body();
      if (input.name !== undefined && (!input.name?.trim() || input.name.length > 200)) {
        throw invalid([{ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' }]);
      }
      if (input.slug !== undefined && (!SLUG.test(input.slug) || input.slug.length > 63)) {
        throw invalid([{ field: 'slug', code: 'matches', message: 'slug must be a DNS label' }]);
      }
      if (input.slug && orgs.some((o) => o.slug === input.slug && o.id !== org.id)) {
        throw new MockHttpError(409, 'ORGANIZATION_SLUG_TAKEN', 'Slug taken');
      }
      if (input.kind !== undefined && input.kind !== org.kind) {
        if (!ORG_KINDS.includes(input.kind))
          throw invalid([{ field: 'kind', code: 'isIn', message: 'invalid kind' }]);
        if (org.kind === 'platform' || input.kind === 'platform') {
          throw new MockHttpError(409, 'ORGANIZATION_PROTECTED', 'Organization protected', {
            detail: 'the platform organization keeps its kind',
          });
        }
        const blocking =
          input.kind !== 'authority' &&
          (memberships.some((m) => m.orgId === org.id && m.role === 'authority') ||
            invitations.some((i) => i.orgId === org.id && i.role === 'authority'));
        if (blocking) {
          throw new MockHttpError(409, 'ORGANIZATION_KIND_CONFLICT', 'Organization kind conflict', {
            detail: 'members or pending invitations hold the role authority',
          });
        }
      }
      const before = { name: org.name, slug: org.slug, kind: org.kind };
      Object.assign(org, input, { updatedAt: nowIso() });
      record(claims, req, 'organization.update', org.id, 'organization', org.id, {
        before,
        after: { name: org.name, slug: org.slug, kind: org.kind },
      });
      send(200, org);
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/organizations/:id',
    permission: 'org:manage',
    handler: ({ claims, req, params, send }) => {
      const org = findOrg(params.id);
      if (org.kind === 'platform') {
        throw new MockHttpError(409, 'ORGANIZATION_PROTECTED', 'Organization protected', {
          detail: 'the platform organization cannot be deleted',
        });
      }
      orgs = orgs.filter((o) => o.id !== org.id);
      memberships = memberships.filter((m) => m.orgId !== org.id);
      invitations = invitations.filter((i) => i.orgId !== org.id);
      apiKeys = apiKeys.filter((k) => k.orgId !== org.id);
      record(claims, req, 'organization.delete', null, 'organization', org.id, { name: org.name });
      send(204);
    },
  },

  // Members and invitations (user:manage, own active organization; super_admin any).
  {
    method: 'GET',
    path: '/api/v2/organizations/:id/members',
    handler: ({ claims, params, url, send }) => {
      manageOrg(claims, params.id);
      const rows = memberships
        .filter((m) => m.orgId === params.id)
        .map(memberOf)
        .sort((a, b) => a.name.localeCompare(b.name));
      send(200, pageOf(rows, url));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/organizations/:id/members',
    handler: async ({ claims, req, params, body, send }) => {
      const org = manageOrg(claims, params.id);
      const input = await body();
      const email = String(input.email ?? '')
        .trim()
        .toLowerCase();
      const errors = [];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.push({ field: 'email', code: 'isEmail', message: 'email must be an email' });
      if (!input.name?.trim())
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      if (errors.length) throw invalid(errors);
      assertRole(org, input.role);
      let account = users.find((u) => u.email === email);
      if (account && memberships.some((m) => m.orgId === org.id && m.userId === account.id)) {
        throw new MockHttpError(409, 'MEMBER_ALREADY_EXISTS', 'Member already exists');
      }
      if (!account) {
        account = user(1000 + (sequence += 1), input.name.trim(), email, {
          status: 'invited',
          lastLoginAt: null,
        });
        users.push(account);
      }
      invitations = invitations.filter((i) => !(i.orgId === org.id && i.userId === account.id));
      const created = {
        id: randomUUID(),
        orgId: org.id,
        userId: account.id,
        name: input.name.trim(),
        email,
        role: input.role,
        invitedBy: claims.sub,
        createdAt: nowIso(),
        expiresAt: ahead(7 * 1440),
      };
      invitations.unshift(created);
      record(claims, req, 'membership.invite', org.id, 'membership_invitation', created.id, {
        role: input.role,
      });
      send(201, { ...invitationOf(created), invitationSent: !email.endsWith('.invalid') });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/organizations/:id/invitations',
    handler: ({ claims, params, url, send }) => {
      manageOrg(claims, params.id);
      const rows = invitations
        .filter((i) => i.orgId === params.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(invitationOf);
      send(200, pageOf(rows, url));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/organizations/:id/invitations/:invitationId/resend',
    handler: ({ claims, req, params, send }) => {
      manageOrg(claims, params.id);
      const found = invitations.find((i) => i.orgId === params.id && i.id === params.invitationId);
      if (!found) throw new MockHttpError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
      found.createdAt = nowIso();
      found.expiresAt = new Date(Date.now() + 7 * 1440 * 60_000).toISOString();
      record(claims, req, 'membership.invite.resend', params.id, 'membership_invitation', found.id);
      send(200, { ...invitationOf(found), invitationSent: true });
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/organizations/:id/invitations/:invitationId',
    handler: ({ claims, req, params, send }) => {
      manageOrg(claims, params.id);
      const found = invitations.find((i) => i.orgId === params.id && i.id === params.invitationId);
      if (!found) throw new MockHttpError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
      invitations = invitations.filter((i) => i !== found);
      record(
        claims,
        req,
        'membership.invite.cancel',
        params.id,
        'membership_invitation',
        found.id,
        {},
      );
      send(204);
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/organizations/:id/members/:userId',
    handler: async ({ claims, req, params, body, send }) => {
      const org = manageOrg(claims, params.id);
      const member = memberships.find((m) => m.orgId === org.id && m.userId === params.userId);
      if (!member) throw new MockHttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
      const { role } = await body();
      assertRole(org, role);
      if (member.role === 'org_admin' && role !== 'org_admin' && lastAdmin(org.id, member.userId)) {
        throw new MockHttpError(
          409,
          'LAST_ORG_ADMIN',
          'An organization must keep at least one org_admin',
        );
      }
      const from = member.role;
      member.role = role;
      record(claims, req, 'membership.update', org.id, 'user', member.userId, { from, to: role });
      send(200, memberOf(member));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/organizations/:id/members/:userId',
    handler: ({ claims, req, params, send }) => {
      const org = manageOrg(claims, params.id);
      const member = memberships.find((m) => m.orgId === org.id && m.userId === params.userId);
      if (!member) throw new MockHttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
      if (member.role === 'org_admin' && lastAdmin(org.id, member.userId)) {
        throw new MockHttpError(
          409,
          'LAST_ORG_ADMIN',
          'An organization must keep at least one org_admin',
        );
      }
      memberships = memberships.filter((m) => m !== member);
      record(claims, req, 'membership.delete', org.id, 'user', member.userId, {
        role: member.role,
      });
      send(204);
    },
  },

  // User directory (org:manage).
  {
    method: 'GET',
    path: '/api/v2/users',
    permission: 'org:manage',
    handler: ({ url, send }) => {
      const term = searchOf(url);
      const status = url.searchParams.get('status');
      const rows = users
        .filter(
          (u) =>
            (!term || u.name.toLowerCase().includes(term) || u.email.includes(term)) &&
            (!status || u.status === status),
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(directoryOf);
      send(200, pageOf(rows, url));
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/users/:id',
    permission: 'org:manage',
    handler: async ({ claims, req, params, body, send }) => {
      const account = users.find((u) => u.id === params.id);
      if (!account) throw new MockHttpError(404, 'USER_NOT_FOUND', 'User not found');
      const { status } = await body();
      if (!['active', 'disabled'].includes(status))
        throw invalid([{ field: 'status', code: 'isIn', message: 'invalid status' }]);
      if (account.id === claims.sub)
        throw new MockHttpError(409, 'CANNOT_CHANGE_OWN_STATUS', 'Cannot change own status');
      if (account.status === 'invited')
        throw new MockHttpError(409, 'INVALID_STATUS_TRANSITION', 'Invalid status transition');
      const from = account.status;
      account.status = status;
      account.updatedAt = nowIso();
      record(claims, req, 'user.status.update', null, 'user', account.id, { from, to: status });
      send(200, directoryOf(account));
    },
  },

  // API keys (api_key:manage; own active organization, super_admin any).
  {
    method: 'GET',
    path: '/api/v2/api-keys',
    permission: 'api_key:manage',
    handler: ({ claims, url, send }) => {
      const orgId = isSuper(claims) ? url.searchParams.get('orgId') || claims.org : claims.org;
      const includeRevoked = url.searchParams.get('includeRevoked') === 'true';
      const rows = apiKeys
        .filter((k) => k.orgId === orgId && (includeRevoked || !k.revokedAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(keyOf);
      send(200, pageOf(rows, url));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/api-keys',
    permission: 'api_key:manage',
    handler: async ({ claims, req, body, send }) => {
      const input = await body();
      const errors = [];
      if (!input.name?.trim() || input.name.length > 200)
        errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
      if (
        !Array.isArray(input.scopes) ||
        input.scopes.length === 0 ||
        input.scopes.some((s) => !SCOPES.includes(s))
      ) {
        errors.push({
          field: 'scopes',
          code: 'arrayNotEmpty',
          message: 'scopes must contain valid scopes',
        });
      }
      if (errors.length) throw invalid(errors);
      if (input.orgId && !isSuper(claims)) throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
      if (input.scopes.includes('ais:ingest') && !isSuper(claims)) {
        throw new MockHttpError(403, 'SCOPE_NOT_GRANTABLE', 'Scope not grantable', {
          detail: 'ais:ingest is granted by super admins only',
        });
      }
      const orgId = input.orgId ?? claims.org;
      findOrg(orgId);
      const created = apiKey(
        (sequence += 1),
        orgId,
        input.name.trim(),
        [...new Set(input.scopes)],
        {
          createdBy: claims.sub,
          createdAt: nowIso(),
        },
      );
      apiKeys.unshift(created);
      record(claims, req, 'api_key.create', orgId, 'api_key', created.id, {
        name: created.name,
        scopes: created.scopes,
      });
      send(201, {
        apiKey: { ...created, key: `${created.prefix}_${randomBytes(24).toString('base64url')}` },
      });
    },
  },
  {
    method: 'POST',
    path: '/api/v2/api-keys/:id/rotate',
    permission: 'api_key:manage',
    handler: async ({ claims, req, params, body, send }) => {
      const key = apiKeys.find(
        (k) => k.id === params.id && (isSuper(claims) || k.orgId === claims.org),
      );
      if (!key) throw new MockHttpError(404, 'API_KEY_NOT_FOUND', 'API key not found');
      if (keyOf(key).status !== 'active')
        throw new MockHttpError(409, 'API_KEY_INACTIVE', 'API key is revoked or expired');
      if (!isSuper(claims) && key.scopes.includes('ais:ingest'))
        throw new MockHttpError(403, 'SCOPE_NOT_GRANTABLE', 'Scope not grantable');
      const input = (await body()) ?? {};
      const grace = input.gracePeriodMin ?? 1440;
      if (!Number.isInteger(grace) || grace < 0 || grace > 7 * 1440)
        throw invalid([{ field: 'gracePeriodMin', code: 'max', message: 'at most 10080' }]);
      key.rotatedAt = nowIso();
      key.previousKeyExpiresAt =
        grace > 0 ? new Date(Date.now() + grace * 60_000).toISOString() : null;
      record(claims, req, 'api_key.rotate', key.orgId, 'api_key', key.id, {
        gracePeriodMin: grace,
      });
      send(200, {
        apiKey: { ...keyOf(key), key: `${key.prefix}${randomBytes(18).toString('base64url')}` },
      });
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/api-keys/:id',
    permission: 'api_key:manage',
    handler: ({ claims, req, params, send }) => {
      const key = apiKeys.find(
        (k) => k.id === params.id && !k.revokedAt && (isSuper(claims) || k.orgId === claims.org),
      );
      if (!key) throw new MockHttpError(404, 'API_KEY_NOT_FOUND', 'API key not found');
      key.revokedAt = nowIso();
      record(claims, req, 'api_key.revoke', key.orgId, 'api_key', key.id, { name: key.name });
      send(204);
    },
  },

  // Audit log (audit:read; own active organization, super_admin all or orgId; cursor pages).
  {
    method: 'GET',
    path: '/api/v2/audit-logs/actions',
    permission: 'audit:read',
    handler: ({ claims, url, send }) => {
      const counts = new Map();
      for (const row of auditRows(claims, url, { ignoreAction: true })) {
        const entry = counts.get(row.action) ?? { action: row.action, count: 0, lastAt: row.at };
        entry.count += 1;
        if (row.at > entry.lastAt) entry.lastAt = row.at;
        counts.set(row.action, entry);
      }
      send(200, { data: [...counts.values()].sort((a, b) => a.action.localeCompare(b.action)) });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/audit-logs.csv',
    permission: 'audit:read',
    handler: ({ claims, url, send }) => {
      const columns = [
        'at',
        'actorType',
        'actorId',
        'actorName',
        'actorEmail',
        'orgId',
        'orgName',
        'action',
        'targetType',
        'targetId',
        'targetLabel',
        'source',
        'ip',
        'meta',
      ];
      const cell = (value) => {
        const text =
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
        const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
      };
      const rows = auditRows(claims, url).map(auditOf);
      const lines = [
        columns.join(','),
        ...rows.map((row) => columns.map((c) => cell(row[c])).join(',')),
      ];
      const scope = isSuper(claims) ? (url.searchParams.get('orgId') ?? 'all') : claims.org;
      send(200, `${lines.join('\r\n')}\r\n`, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-logs-${scope}.csv"`,
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Cache-Control': 'no-store',
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/audit-logs',
    permission: 'audit:read',
    handler: ({ claims, url, send }) => {
      const rows = auditRows(claims, url);
      send(200, cursorPageOf(rows.map(auditOf), url));
    },
  },

  // Fleet reference data with writes (reference:write = super_admin).
  ...Object.keys(REFERENCE).flatMap(referenceRoutes),

  // Telemetry devices (device:manage; own organization, super_admin all or orgId).
  {
    method: 'GET',
    path: '/api/v2/telemetry/devices',
    permission: 'device:manage',
    handler: ({ claims, url, send }) => {
      const orgId = scopeOrg(claims, url);
      const q = url.searchParams;
      const term = searchOf(url);
      const rows = devices
        .filter(
          (d) =>
            (!orgId || d.orgId === orgId) &&
            (!q.get('mmsi') || String(d.mmsi) === q.get('mmsi')) &&
            (!q.get('kind') || d.kind === q.get('kind')) &&
            (!q.get('status') || d.status === q.get('status')) &&
            (!term ||
              d.name.toLowerCase().includes(term) ||
              (d.serialNumber ?? '').toLowerCase().includes(term)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      send(200, pageOf(rows.map(deviceOf), url));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/devices/:id/connection',
    permission: 'device:manage',
    handler: ({ claims, params, send }) => {
      const device = visibleDevice(claims, params.id);
      if (device.kind !== 'mqtt')
        throw new MockHttpError(409, 'DEVICE_NOT_MQTT', 'The device posts over HTTP');
      send(200, {
        deviceId: device.id,
        brokerUrl: 'mqtts://mqtt.ais-its.local:8883',
        host: 'mqtt.ais-its.local',
        port: 8883,
        tls: true,
        protocolVersion: '3.1.1',
        topic: device.mqttTopic ?? `aisits/telemetry/${device.id}`,
        qos: 1,
        authentication: 'password',
        username: device.id,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/telemetry/devices/:id',
    permission: 'device:manage',
    handler: ({ claims, params, send }) => send(200, deviceOf(visibleDevice(claims, params.id))),
  },
  {
    method: 'POST',
    path: '/api/v2/telemetry/devices',
    permission: 'device:manage',
    handler: async ({ claims, req, body, send }) => {
      const input = await body();
      const orgId = vesselOrg(claims, input.mmsi);
      const next = { status: 'active', apiKeyId: null, serialNumber: null, ...input, orgId };
      checkDevice(next, null);
      const deviceId = randomUUID();
      const created = {
        ...next,
        id: deviceId,
        mqttTopic: next.kind === 'mqtt' ? `aisits/telemetry/${deviceId}` : null,
        lastSeenAt: null,
        createdBy: claims.sub,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      devices.push(created);
      record(claims, req, 'device.create', orgId, 'device', deviceId, {
        name: created.name,
        kind: created.kind,
        mmsi: created.mmsi,
      });
      send(201, deviceOf(created));
    },
  },
  {
    method: 'PATCH',
    path: '/api/v2/telemetry/devices/:id',
    permission: 'device:manage',
    handler: async ({ claims, req, params, body, send }) => {
      const current = visibleDevice(claims, params.id);
      const input = await body();
      for (const key of ['mmsi', 'name', 'kind', 'status']) {
        if (input[key] === null)
          throw invalid([{ field: key, code: 'isDefined', message: `${key} must not be null` }]);
      }
      if (input.mmsi !== undefined && vesselOrg(claims, input.mmsi) !== current.orgId) {
        throw new MockHttpError(403, 'FORBIDDEN', 'The vessel belongs to another organization');
      }
      const next = { ...current, ...input };
      if (next.kind === 'mqtt') next.apiKeyId = null;
      checkDevice(next, current.id);
      Object.assign(current, next, {
        mqttTopic: next.kind === 'mqtt' ? `aisits/telemetry/${current.id}` : null,
        updatedAt: nowIso(),
      });
      record(claims, req, 'device.update', current.orgId, 'device', current.id, {
        fields: Object.keys(input),
      });
      send(200, deviceOf(current));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/telemetry/devices/:id',
    permission: 'device:manage',
    handler: ({ claims, req, params, send }) => {
      const current = visibleDevice(claims, params.id);
      devices = devices.filter((d) => d !== current);
      record(claims, req, 'device.delete', current.orgId, 'device', current.id, {
        name: current.name,
      });
      send(204);
    },
  },
];

/** Telemetry 0.2 device fields: vessel name, newest reading and the connection state. */
function deviceOf(d) {
  const lastReadingAt = d.lastSeenAt;
  const age = lastReadingAt ? Date.now() - Date.parse(lastReadingAt) : null;
  return {
    ...d,
    vesselName: VESSELS.find(([mmsi]) => mmsi === d.mmsi)?.[1] ?? null,
    lastReadingAt,
    connectionState:
      d.status !== 'active'
        ? 'inactive'
        : age === null
          ? 'never'
          : age <= 15 * 60_000
            ? 'online'
            : age <= 1440 * 60_000
              ? 'idle'
              : 'offline',
    activeWindowMin: 15,
    offlineAfterMin: 1440,
  };
}

function visibleDevice(claims, deviceId) {
  const found = devices.find(
    (d) => d.id === deviceId && (isSuper(claims) || d.orgId === claims.org),
  );
  if (!found) throw new MockHttpError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  return found;
}

/** Organization of a live vessel the caller may register devices for. */
function vesselOrg(claims, mmsi) {
  if (!Number.isInteger(mmsi) || String(mmsi).length !== 9) {
    throw invalid([{ field: 'mmsi', code: 'isMmsi', message: 'mmsi must be a nine-digit MMSI' }]);
  }
  if (!VESSELS.some(([m]) => m === mmsi))
    throw new MockHttpError(404, 'VESSEL_NOT_FOUND', 'Vessel not found');
  const orgId = FOREIGN_MMSIS.has(mmsi) ? '0192f0c8-7d3a-7c2e-9a1b-0000000000f1' : FLEET_ORG_ID;
  if (!isSuper(claims) && orgId !== claims.org)
    throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden');
  return orgId;
}

function checkDevice(next, selfId) {
  const errors = [];
  if (!next.name?.trim() || next.name.length > 120)
    errors.push({ field: 'name', code: 'isNotEmpty', message: 'name should not be empty' });
  if (!['mqtt', 'http'].includes(next.kind))
    errors.push({ field: 'kind', code: 'isIn', message: 'kind must be mqtt or http' });
  if (!['active', 'inactive'].includes(next.status))
    errors.push({ field: 'status', code: 'isIn', message: 'invalid status' });
  if (next.kind === 'http' && !next.apiKeyId)
    errors.push({ field: 'apiKeyId', code: 'isDefined', message: 'http devices need an API key' });
  if (next.kind === 'mqtt' && next.apiKeyId)
    errors.push({ field: 'apiKeyId', code: 'isEmpty', message: 'mqtt devices have no API key' });
  if (errors.length) throw invalid(errors);
  if (
    devices.some((d) => d.id !== selfId && d.orgId === next.orgId && d.name === next.name.trim())
  ) {
    throw new MockHttpError(409, 'DEVICE_NAME_TAKEN', 'Device name taken');
  }
  if (next.apiKeyId) {
    const key = apiKeys.find(
      (k) => k.id === next.apiKeyId && k.orgId === next.orgId && !k.revokedAt,
    );
    if (!key || !key.scopes.includes('telemetry:ingest')) {
      throw invalid([
        {
          field: 'apiKeyId',
          code: 'apiKey',
          message: 'unknown API key or missing scope telemetry:ingest',
        },
      ]);
    }
    if (devices.some((d) => d.id !== selfId && d.apiKeyId === next.apiKeyId)) {
      throw new MockHttpError(409, 'DEVICE_API_KEY_TAKEN', 'API key taken');
    }
  }
  next.name = next.name.trim();
}

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

reset();
