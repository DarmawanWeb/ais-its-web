// Notification service mock for the alert-rules feature (spec §13.9,
// services/notification/README.md): rule CRUD with the tenancy and scope rules of the service
// (scope `all` only for authority members of the rule's organization; changing an `all` rule
// needs that membership or a platform admin → 403 RULE_SCOPE_FORBIDDEN), test notifications
// (Telegram / webhook "sent" at once, e-mail "queued", 10 per user per 10 minutes → 429) and
// the delivery log (cursor pages, filters ruleId / alertId / status) and the signing keys of
// webhook channels (notification 0.2: one key per rule + target, `keyId` in every response, the
// `signingSecret` only in the response that created the key — POST, a PATCH adding the target,
// POST /alert-rules/:id/channels/:index/rotate-secret). The delivery log replaces
// the alerts module's RegExp fallback with the same deliveries of the seeded alerts, so the
// alert detail keeps showing them.
import { randomBytes, randomUUID } from 'node:crypto';

import { cursorPageOf, FLEET_ORG_ID, MockHttpError, ORGS, pageOf } from '../lib.mjs';

const MINUTE = 60_000;
const ago = (minutes) => new Date(Date.now() - minutes * MINUTE).toISOString();
const AUTHORITY_ORG_ID = ORGS.find((org) => org.kind === 'authority')?.id ?? ORGS[1].id;
const ADMIN_ID = '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a';
const MANAGER_ID = '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6b';
const ruleId = (n) => `0192f0c8-7d3a-7c2e-9a20-${String(n).padStart(12, '0')}`;
const alertId = (suffix) => `0192f0c8-7d3a-7c2e-9a1b-0000000${suffix}`;

const SEED_RULES = [
  {
    id: ruleId(1),
    orgId: FLEET_ORG_ID,
    createdBy: ADMIN_ID,
    name: 'EWS & tubrukan kritis armada',
    scope: 'org',
    types: ['ews', 'collision'],
    domains: [],
    minSeverity: 'warning',
    mmsi: [],
    zoneIds: [],
    channels: [
      { type: 'telegram', target: '-1001234567890' },
      { type: 'email', target: 'ops@pelni.test' },
    ],
    locale: 'id',
    quietMinutes: 30,
    enabled: true,
    createdAt: ago(60 * 24 * 12),
    updatedAt: ago(60 * 26),
  },
  {
    id: ruleId(2),
    orgId: FLEET_ORG_ID,
    createdBy: MANAGER_ID,
    name: 'Pengawasan kapal tanker',
    scope: 'org',
    types: [],
    domains: ['surveillance'],
    minSeverity: 'warning',
    mmsi: [525005223, 525019002],
    zoneIds: [],
    channels: [{ type: 'webhook', target: 'https://ops.pelni.test/hooks/ais' }],
    locale: 'en',
    quietMinutes: 60,
    enabled: true,
    createdAt: ago(60 * 24 * 8),
    updatedAt: ago(60 * 5),
  },
  {
    id: ruleId(3),
    orgId: FLEET_ORG_ID,
    createdBy: ADMIN_ID,
    name: 'Ringkasan informasi harian',
    scope: 'org',
    types: [],
    domains: [],
    minSeverity: 'info',
    mmsi: [],
    zoneIds: [],
    channels: [
      { type: 'email', target: 'nakhoda@pelni.test' },
      { type: 'email', target: 'hse@pelni.test' },
    ],
    locale: 'id',
    quietMinutes: 1440,
    enabled: false,
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 24 * 3),
  },
  {
    id: ruleId(4),
    orgId: AUTHORITY_ORG_ID,
    createdBy: ADMIN_ID,
    name: 'Pengawasan Selat Singapura (lintas tenant)',
    scope: 'all',
    types: ['transhipment', 'dark', 'fishing'],
    domains: [],
    minSeverity: 'warning',
    mmsi: [],
    zoneIds: [],
    channels: [{ type: 'telegram', target: '@ksop_batam_ops' }],
    locale: 'id',
    quietMinutes: 15,
    enabled: true,
    createdAt: ago(60 * 24 * 20),
    updatedAt: ago(60 * 24 * 2),
  },
];

/** [suffix, rule n, alert suffix, channel, target, status, attempts, error, minutes ago] */
const SEED_DELIVERIES = [
  ['d01', 1, 'a1e01', 'telegram', '-1001234567890', 'sent', 1, null, 6],
  ['d02', 1, 'a1e01', 'email', 'ops@pelni.test', 'queued', 1, null, 6],
  [
    'd03',
    2,
    'a1e02',
    'webhook',
    'https://ops.pelni.test/hooks/ais',
    'failed',
    6,
    'HTTP 503 from the receiver',
    18,
  ],
  ['d04', 1, 'a1e02', 'telegram', '-1001234567890', 'sent', 1, null, 18],
  ['d05', 1, 'a1e04', 'email', 'ops@pelni.test', 'sent', 2, null, 95],
  [
    'd06',
    1,
    'a1e11',
    'telegram',
    '-1001234567890',
    'pending',
    2,
    'Telegram 429: retry after 30 s',
    140,
  ],
  ['d07', 2, 'a1e03', 'webhook', 'https://ops.pelni.test/hooks/ais', 'sent', 1, null, 42],
  ['d08', 4, 'a1e05', 'telegram', '@ksop_batam_ops', 'sent', 1, null, 75],
];

const SEVERITY_OF = {
  a1e01: 'critical',
  a1e02: 'warning',
  a1e03: 'warning',
  a1e04: 'warning',
  a1e05: 'critical',
  a1e11: 'critical',
};

function seedDeliveries() {
  return SEED_DELIVERIES.map(
    ([suffix, rule, alert, channel, target, status, attempts, error, minutes]) => ({
      id: `0192f0c8-7d3a-7c2e-9a1f-0000000${suffix}00`,
      alertId: alertId(alert),
      ruleId: ruleId(rule),
      channel,
      target,
      severity: SEVERITY_OF[alert] ?? 'warning',
      status,
      attempts,
      error,
      nextAttemptAt: status === 'pending' ? ago(-2) : ago(minutes),
      lastAttemptAt: ago(minutes),
      sentAt: status === 'sent' || status === 'queued' ? ago(minutes) : null,
      createdAt: ago(minutes + 1),
    }),
  );
}

let rules = structuredClone(SEED_RULES);
let deliveries = seedDeliveries();
let nextRule = 100;

// --- signing keys of webhook channels (rule id + target → key) ------------------------------

/** The seeded webhook of rule 2 has its own key (created with notification 0.2). */
const SEED_KEYS = [
  [ruleId(2), 'https://ops.pelni.test/hooks/ais', '0192f0c8-7d3a-7c2e-9a30-000000000001'],
];
const keyOf = (rule, target) => `${rule}|${target}`;
const seedKeys = () =>
  new Map(
    SEED_KEYS.map(([rule, target, id]) => [keyOf(rule, target), { id, secret: newSecret() }]),
  );
function newSecret() {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}
let keys = seedKeys();

/** A new key for the webhook channel `target` of `rule`; returns its secret (shown once). */
function issueKey(rule, target) {
  const key = { id: randomUUID(), secret: newSecret() };
  keys.set(keyOf(rule.id, target), key);
  return key;
}

/** The rule as the API shows it: webhooks with `keyId`, `signingSecret` only for `reveal`. */
function view(rule, reveal = new Set()) {
  return {
    ...rule,
    channels: rule.channels.map((channel, index) => {
      const key = channel.type === 'webhook' ? keys.get(keyOf(rule.id, channel.target)) : undefined;
      return {
        type: channel.type,
        target: channel.target,
        keyId: key?.id ?? null,
        signingSecret: key && reveal.has(index) ? key.secret : null,
      };
    }),
  };
}

/** Keys for webhook targets new to `rule` (dropped targets lose theirs); indexes to reveal. */
function syncKeys(rule, previousTargets) {
  const reveal = new Set();
  const webhookTargets = new Set();
  rule.channels.forEach((channel, index) => {
    if (channel.type !== 'webhook') return;
    webhookTargets.add(channel.target);
    if (!previousTargets.has(channel.target)) {
      issueKey(rule, channel.target);
      reveal.add(index);
    }
  });
  for (const target of previousTargets) {
    if (!webhookTargets.has(target)) keys.delete(keyOf(rule.id, target));
  }
  return reveal;
}

const webhookTargetsOf = (rule) =>
  new Set(rule.channels.filter((c) => c.type === 'webhook').map((c) => c.target));
/** userId → timestamps of test notifications (10 per 10 minutes). */
let testsByUser = new Map();

// --- rules of the service -------------------------------------------------------------------

const isAdmin = (claims) => (claims.roles ?? []).includes('super_admin');
const actsAsAuthorityOf = (claims, orgId) =>
  claims.org === orgId && (claims.roles ?? []).includes('authority');

function invalid(errors) {
  return new MockHttpError(400, 'VALIDATION_FAILED', 'Validation failed', { errors });
}

function visibleRule(claims, id) {
  const rule = rules.find((r) => r.id === id);
  if (!rule || (!isAdmin(claims) && rule.orgId !== claims.org))
    throw new MockHttpError(404, 'ALERT_RULE_NOT_FOUND', 'Alert rule not found');
  return rule;
}

const SEVERITIES = ['info', 'warning', 'critical'];
const DOMAINS = ['safety', 'surveillance'];
const CHANNELS = ['email', 'telegram', 'webhook'];

function checkTarget(channel, target, field) {
  if (typeof target !== 'string' || !target.trim() || target.length > 2048)
    return [{ field, message: 'target must be a non-empty string of at most 2048 characters' }];
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
    return [{ field, message: 'target must be an e-mail address' }];
  if (channel === 'telegram' && !/^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/.test(target))
    return [{ field, message: 'target must be a chat id or @channel' }];
  if (channel === 'webhook' && !/^https?:\/\/[^\s]+$/.test(target))
    return [{ field, message: 'target must be an http(s) URL' }];
  return [];
}

/** Validates the members present in `input` (create: `partial` false). */
function validateRule(input, partial) {
  const errors = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === null) errors.push({ field: key, message: `${key} must not be null` });
  }
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120)
      errors.push({ field: 'name', message: 'name must be 1 to 120 characters long' });
  }
  if (!partial || input.channels !== undefined) {
    if (!Array.isArray(input.channels) || input.channels.length < 1 || input.channels.length > 10) {
      errors.push({ field: 'channels', message: 'channels must contain 1 to 10 items' });
    } else {
      input.channels.forEach((channel, index) => {
        if (!CHANNELS.includes(channel?.type))
          errors.push({ field: `channels.${index}.type`, message: 'unknown channel type' });
        else errors.push(...checkTarget(channel.type, channel.target, `channels.${index}.target`));
      });
    }
  }
  if (input.minSeverity !== undefined && !SEVERITIES.includes(input.minSeverity))
    errors.push({ field: 'minSeverity', message: 'minSeverity must be info, warning or critical' });
  if (
    input.domains !== undefined &&
    (!Array.isArray(input.domains) || input.domains.some((d) => !DOMAINS.includes(d)))
  )
    errors.push({ field: 'domains', message: 'unknown domain' });
  if (
    input.quietMinutes !== undefined &&
    (!Number.isInteger(input.quietMinutes) || input.quietMinutes < 0 || input.quietMinutes > 10080)
  )
    errors.push({
      field: 'quietMinutes',
      message: 'quietMinutes must be an integer from 0 to 10080',
    });
  if (input.scope !== undefined && !['org', 'all'].includes(input.scope))
    errors.push({ field: 'scope', message: 'scope must be org or all' });
  if (errors.length > 0) throw invalid(errors);
}

const scopeForbidden = (detail) =>
  new MockHttpError(403, 'RULE_SCOPE_FORBIDDEN', 'Rule scope forbidden', { detail });

function assertScope({ orgId, current, next }, claims) {
  const authority = actsAsAuthorityOf(claims, orgId);
  if (next === 'all' && current !== 'all' && !authority)
    throw scopeForbidden(
      'Only rules of an authority organization, written by its authority members, may watch every vessel',
    );
  if (current === 'all' && !authority && !isAdmin(claims))
    throw scopeForbidden(
      'Only authority members of the organization may change a rule that watches every vessel',
    );
}

const pick = (input) => ({
  ...(input.name !== undefined ? { name: input.name.trim() } : {}),
  ...(input.types !== undefined ? { types: input.types } : {}),
  ...(input.domains !== undefined ? { domains: input.domains } : {}),
  ...(input.minSeverity !== undefined ? { minSeverity: input.minSeverity } : {}),
  ...(input.mmsi !== undefined ? { mmsi: input.mmsi } : {}),
  ...(input.zoneIds !== undefined ? { zoneIds: input.zoneIds } : {}),
  ...(input.channels !== undefined
    ? { channels: input.channels.map((c) => ({ type: c.type, target: c.target.trim() })) }
    : {}),
  ...(input.locale !== undefined ? { locale: input.locale } : {}),
  ...(input.quietMinutes !== undefined ? { quietMinutes: input.quietMinutes } : {}),
  ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
});

/** @type {import('../lib.mjs').MockRoute[]} */
export const routes = [
  {
    method: 'GET',
    path: '/api/v2/alert-rules',
    permission: 'alert_rule:write',
    handler: ({ claims, url, send }) => {
      const orgId = url.searchParams.get('orgId');
      const enabled = url.searchParams.get('enabled');
      if (!isAdmin(claims) && !claims.org)
        throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'Organization required');
      const items = rules
        .filter((rule) =>
          isAdmin(claims) ? !orgId || rule.orgId === orgId : rule.orgId === claims.org,
        )
        .filter((rule) => enabled === null || String(rule.enabled) === enabled)
        .sort((a, b) => a.name.localeCompare(b.name));
      const params = new URL(url);
      params.searchParams.delete('orgId');
      params.searchParams.delete('enabled');
      send(
        200,
        pageOf(
          items.map((rule) => view(rule)),
          params,
        ),
      );
    },
  },
  {
    method: 'POST',
    path: '/api/v2/alert-rules',
    permission: 'alert_rule:write',
    handler: async ({ claims, body, send }) => {
      const input = await body();
      validateRule(input, false);
      if (input.orgId !== undefined && !isAdmin(claims))
        throw new MockHttpError(403, 'FORBIDDEN', 'Forbidden', {
          detail: 'orgId is reserved to platform administrators',
        });
      const orgId = input.orgId ?? claims.org;
      if (!orgId) throw new MockHttpError(403, 'ORGANIZATION_REQUIRED', 'Organization required');
      const scope = input.scope ?? (actsAsAuthorityOf(claims, orgId) ? 'all' : 'org');
      assertScope({ orgId, current: undefined, next: scope }, claims);
      const now = new Date().toISOString();
      const rule = {
        id: ruleId((nextRule += 1)),
        orgId,
        createdBy: claims.sub,
        name: '',
        scope,
        types: [],
        domains: [],
        minSeverity: 'info',
        mmsi: [],
        zoneIds: [],
        channels: [],
        locale: 'id',
        quietMinutes: 0,
        enabled: true,
        ...pick(input),
        createdAt: now,
        updatedAt: now,
      };
      rules.push(rule);
      const reveal = syncKeys(rule, new Set());
      send(201, view(rule, reveal));
    },
  },
  {
    method: 'GET',
    path: '/api/v2/alert-rules/:id',
    permission: 'alert_rule:write',
    handler: ({ claims, params, send }) => send(200, view(visibleRule(claims, params.id))),
  },
  {
    method: 'PATCH',
    path: '/api/v2/alert-rules/:id',
    permission: 'alert_rule:write',
    handler: async ({ claims, params, body, send }) => {
      const rule = visibleRule(claims, params.id);
      const input = await body();
      validateRule(input, true);
      assertScope(
        { orgId: rule.orgId, current: rule.scope, next: input.scope ?? rule.scope },
        claims,
      );
      const previousTargets = webhookTargetsOf(rule);
      Object.assign(rule, pick(input), input.scope ? { scope: input.scope } : {}, {
        updatedAt: new Date().toISOString(),
      });
      const reveal = input.channels === undefined ? new Set() : syncKeys(rule, previousTargets);
      send(200, view(rule, reveal));
    },
  },
  {
    method: 'POST',
    path: '/api/v2/alert-rules/:id/channels/:index/rotate-secret',
    permission: 'alert_rule:write',
    handler: ({ claims, params, send }) => {
      const rule = visibleRule(claims, params.id);
      assertScope({ orgId: rule.orgId, current: rule.scope, next: rule.scope }, claims);
      const index = Number(params.index);
      const channel = Number.isInteger(index) ? rule.channels[index] : undefined;
      if (!channel)
        throw new MockHttpError(404, 'RULE_CHANNEL_NOT_FOUND', 'Rule channel not found');
      if (channel.type !== 'webhook')
        throw new MockHttpError(422, 'RULE_CHANNEL_NOT_WEBHOOK', 'Rule channel is not a webhook');
      issueKey(rule, channel.target);
      rule.updatedAt = new Date().toISOString();
      send(200, view(rule, new Set([index])));
    },
  },
  {
    method: 'DELETE',
    path: '/api/v2/alert-rules/:id',
    permission: 'alert_rule:write',
    handler: ({ claims, params, send }) => {
      const rule = visibleRule(claims, params.id);
      assertScope({ orgId: rule.orgId, current: rule.scope, next: rule.scope }, claims);
      rules = rules.filter((r) => r.id !== rule.id);
      for (const target of webhookTargetsOf(rule)) keys.delete(keyOf(rule.id, target));
      deliveries = deliveries.filter((d) => d.ruleId !== rule.id);
      send(204);
    },
  },
  {
    method: 'POST',
    path: '/api/v2/notifications/test',
    permission: 'alert_rule:write',
    handler: async ({ claims, body, send }) => {
      const { channel, target } = await body();
      if (!CHANNELS.includes(channel))
        throw invalid([{ field: 'channel', message: 'unknown channel' }]);
      const errors = checkTarget(channel, target, 'target');
      if (errors.length > 0) throw invalid(errors);
      const now = Date.now();
      const recent = (testsByUser.get(claims.sub) ?? []).filter((at) => now - at < 10 * MINUTE);
      if (recent.length >= 10) {
        const retryAfter = Math.ceil((recent[0] + 10 * MINUTE - now) / 1000);
        throw new MockHttpError(429, 'RATE_LIMITED', 'Too many requests', {
          retryAfterSeconds: retryAfter,
        });
      }
      testsByUser.set(claims.sub, [...recent, now]);
      // webhook tests are signed with the key of the organization's channel, else a throwaway key
      const orgKey =
        channel === 'webhook'
          ? rules
              .filter((rule) => rule.orgId === claims.org)
              .map((rule) => keys.get(keyOf(rule.id, target)))
              .find(Boolean)
          : undefined;
      const keyId = channel === 'webhook' ? (orgKey?.id ?? 'test') : null;
      if (channel === 'email')
        return send(200, { channel, target, status: 'queued', error: null, keyId });
      if (/fail|unreachable/i.test(target))
        return send(200, {
          channel,
          target,
          status: 'failed',
          error:
            channel === 'webhook'
              ? 'Webhook unreachable: ETIMEDOUT'
              : 'Bad Request: chat not found',
          keyId,
        });
      return send(200, { channel, target, status: 'sent', error: null, keyId });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/notifications/deliveries/summary',
    permission: 'alert_rule:write',
    handler: ({ claims, url, send }) => {
      const to = url.searchParams.get('to') ? Date.parse(url.searchParams.get('to')) : Date.now();
      const from = url.searchParams.get('from')
        ? Date.parse(url.searchParams.get('from'))
        : to - 30 * 86_400_000;
      const ruleId = url.searchParams.get('ruleId');
      const ownRules = new Set(
        rules.filter((rule) => isAdmin(claims) || rule.orgId === claims.org).map((rule) => rule.id),
      );
      const items = deliveries.filter((d) => {
        const at = Date.parse(d.createdAt);
        return ownRules.has(d.ruleId) && (!ruleId || d.ruleId === ruleId) && at >= from && at <= to;
      });
      const count = (status) => items.filter((d) => d.status === status).length;
      const sent = count('sent');
      const failed = count('failed');
      const lastDeliveredAt =
        items
          .filter((d) => d.status === 'sent' && d.sentAt)
          .map((d) => d.sentAt)
          .sort()
          .at(-1) ?? null;
      send(200, {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        sent,
        failed,
        pending: count('pending'),
        queued: count('queued'),
        total: items.length,
        lastDeliveredAt,
        successRate: sent + failed > 0 ? sent / (sent + failed) : null,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/v2/notifications/deliveries',
    permission: 'alert_rule:write',
    handler: ({ claims, url, send }) => {
      const filter = Object.fromEntries(
        ['ruleId', 'alertId', 'status'].map((key) => [key, url.searchParams.get(key)]),
      );
      const ownRules = new Set(
        rules.filter((rule) => isAdmin(claims) || rule.orgId === claims.org).map((rule) => rule.id),
      );
      const items = deliveries
        .filter((d) => ownRules.has(d.ruleId))
        .filter((d) => !filter.ruleId || d.ruleId === filter.ruleId)
        .filter((d) => !filter.alertId || d.alertId === filter.alertId)
        .filter((d) => !filter.status || d.status === filter.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const params = new URL(url);
      for (const key of Object.keys(filter)) params.searchParams.delete(key);
      send(200, cursorPageOf(items, params));
    },
  },
];

export function reset() {
  rules = structuredClone(SEED_RULES);
  keys = seedKeys();
  deliveries = seedDeliveries();
  nextRule = 100;
  testsByUser = new Map();
}
