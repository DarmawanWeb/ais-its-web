/**
 * Readable audit records (central audit log of the auth service, spec §13.1): known actions of
 * every service get a translated label (`audit.actions.<action>` with dots replaced by `__`),
 * and the free-form `meta` is turned into a diff where the services record one.
 */

/** Actions audited by the services (handbooks of auth, fleet, telemetry, notification, geo…). */
export const KNOWN_AUDIT_ACTIONS = [
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.logout',
  'auth.refresh.reuse_detected',
  'auth.session.revoke',
  'auth.session.switch_org',
  'auth.password.change',
  'auth.password.reset',
  'auth.password.reset_request',
  'auth.invite.accept',
  'auth.mfa.enable',
  'auth.mfa.disable',
  'auth.signing_key.rotate',
  'membership.invite',
  'membership.invite.cancel',
  'membership.update',
  'membership.delete',
  'api_key.create',
  'api_key.revoke',
  'organization.create',
  'organization.update',
  'organization.delete',
  'user.update',
  'user.status.update',
  'platform.bootstrap',
  'vessel.create',
  'vessel.update',
  'vessel.delete',
  'vessel_type.create',
  'vessel_type.update',
  'vessel_type.delete',
  'fuel.create',
  'fuel.update',
  'fuel.delete',
  'engine.create',
  'engine.update',
  'engine.delete',
  'fuel_formula.create',
  'fuel_formula.update',
  'fuel_formula.delete',
  'port.create',
  'port.update',
  'port.delete',
  'device.create',
  'device.update',
  'device.delete',
  'fuel_reading.create',
  'alert.acknowledge',
  'alert.resolve',
  'alert_rule.create',
  'alert_rule.update',
  'alert_rule.delete',
  'notification.test',
  'zone.create',
  'zone.update',
  'zone.delete',
] as const;

/** Target types of the audit log filter. */
export const KNOWN_TARGET_TYPES = [
  'user',
  'session',
  'organization',
  'membership',
  'membership_invitation',
  'api_key',
  'signing_key',
  'vessel',
  'vessel_type',
  'fuel',
  'engine',
  'fuel_formula',
  'port',
  'device',
  'alert',
  'alert_rule',
  'zone',
] as const;

/** Translation key of an action (i18next keys cannot contain the dots of the action). */
export function actionKey(action: string): string {
  return `audit.actions.${action.replaceAll('.', '__')}`;
}

/** Severity of an action for its badge: failures and destructive changes stand out. */
export function actionTone(action: string): 'danger' | 'warning' | 'success' | 'default' {
  if (/(failed|reuse_detected|\.delete$|\.revoke$|cancel)/.test(action)) return 'danger';
  if (/(disable|status\.update|password|mfa|rotate)/.test(action)) return 'warning';
  if (/(\.create$|succeeded|accept|enable)/.test(action)) return 'success';
  return 'default';
}

export interface MetaChange {
  readonly key: string;
  readonly from: unknown;
  readonly to: unknown;
}

export interface MetaView {
  /** Changed values (`{ from, to }`, `before` / `after`, `changes`). */
  readonly changes: readonly MetaChange[];
  /** Names of changed fields without values (`fields: [...]`). */
  readonly fields: readonly string[];
  /** Everything else, key by key. */
  readonly entries: readonly { key: string; value: unknown }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Structures an audit record's `meta` for display. The services record changes in a few
 * shapes: `{ from, to }` (roles, statuses), `{ fields: [...] }` (PATCH members), `before` /
 * `after` snapshots, and `changes` maps or lists; the rest are plain key/value facts.
 */
export function describeMeta(meta: Record<string, unknown> | null | undefined): MetaView {
  const changes: MetaChange[] = [];
  const fields: string[] = [];
  const entries: { key: string; value: unknown }[] = [];
  if (!meta) return { changes, fields, entries };
  const rest = { ...meta };

  if ('from' in rest && 'to' in rest) {
    changes.push({ key: 'value', from: rest.from, to: rest.to });
    delete rest.from;
    delete rest.to;
  }
  if (isRecord(rest.before) || isRecord(rest.after)) {
    const before = isRecord(rest.before) ? rest.before : {};
    const after = isRecord(rest.after) ? rest.after : {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!same(before[key], after[key])) changes.push({ key, from: before[key], to: after[key] });
    }
    delete rest.before;
    delete rest.after;
  }
  if (isRecord(rest.changes)) {
    for (const [key, value] of Object.entries(rest.changes)) {
      if (isRecord(value) && ('from' in value || 'to' in value)) {
        changes.push({ key, from: value.from, to: value.to });
      } else {
        changes.push({ key, from: undefined, to: value });
      }
    }
    delete rest.changes;
  } else if (Array.isArray(rest.changes)) {
    for (const item of rest.changes) {
      if (isRecord(item) && typeof item.field === 'string') {
        changes.push({ key: item.field, from: item.from, to: item.to });
      }
    }
    delete rest.changes;
  }
  if (Array.isArray(rest.fields) && rest.fields.every((field) => typeof field === 'string')) {
    fields.push(...rest.fields);
    delete rest.fields;
  }
  for (const [key, value] of Object.entries(rest)) {
    // Per-field changes recorded as `{ role: { from, to } }`.
    if (isRecord(value) && 'from' in value && 'to' in value && Object.keys(value).length === 2) {
      changes.push({ key, from: value.from, to: value.to });
    } else {
      entries.push({ key, value });
    }
  }
  return { changes, fields, entries };
}

/** A meta value as text (JSON for objects and lists, "—" for nothing). */
export function formatMetaValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Short form of a UUID for tables ("0192f0c8…5b6a"). */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
