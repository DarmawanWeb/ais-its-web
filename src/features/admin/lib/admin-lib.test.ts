import { describe, expect, it } from 'vitest';

import { grantableRoles, grantableScopes, isLastOrgAdmin, slugify, SLUG_PATTERN } from './access';
import { actionKey, actionTone, describeMeta, formatMetaValue, shortId } from './audit';
import { connectionState } from './devices';
import { checkFormula, previewFormula } from './fuel-formula';

describe('fuel formula grammar', () => {
  it('accepts the documented language and evaluates it', () => {
    const check = checkFormula('-0.0382 * speedKnot ^ 2 + 0.8658 * speedKnot - 0.0197');
    expect(check.valid).toBe(true);
    if (check.valid) expect(check.evaluate(10)).toBeCloseTo(4.8183, 4);
    const exp = checkFormula('1.5103 * Math.exp(-0.064 * speedKnot)');
    expect(exp.valid && exp.evaluate(0)).toBeCloseTo(1.5103);
    expect(checkFormula('max(0.5, ln(speedKnot + 1), sqrt(4))').valid).toBe(true);
    // ^ and ** are right-associative powers.
    const power = checkFormula('2 ** 3 ^ 2');
    expect(power.valid && power.evaluate(0)).toBe(512);
  });

  it('refuses anything else with the position of the problem', () => {
    expect(checkFormula('process.exit(1)')).toMatchObject({
      valid: false,
      problem: { code: 'unknownName', position: 0, token: 'process.exit' },
    });
    expect(checkFormula('Math.random()')).toMatchObject({ problem: { code: 'unknownName' } });
    expect(checkFormula('speed * 2')).toMatchObject({
      problem: { code: 'unknownName', token: 'speed' },
    });
    expect(checkFormula('constructor(1)')).toMatchObject({ problem: { code: 'unknownName' } });
    expect(checkFormula('pow(speedKnot)')).toMatchObject({
      problem: { code: 'arity', token: 'pow', expected: 2, actual: 1 },
    });
    expect(checkFormula('1 + ')).toMatchObject({ problem: { code: 'unexpectedEnd', position: 4 } });
    expect(checkFormula('1 % 2')).toMatchObject({
      problem: { code: 'unexpectedToken', position: 2, token: '%' },
    });
    expect(checkFormula('1e999')).toMatchObject({ problem: { code: 'badNumber' } });
    expect(checkFormula('   ')).toMatchObject({ problem: { code: 'empty' } });
    expect(checkFormula('1'.repeat(501))).toMatchObject({ problem: { code: 'tooLong' } });
    expect(checkFormula(`${'('.repeat(40)}1${')'.repeat(40)}`)).toMatchObject({
      problem: { code: 'tooDeep' },
    });
  });

  it('previews the flow at a few speeds', () => {
    expect(previewFormula('speedKnot * 2')).toEqual([0, 8, 16, 24, 32, 40]);
    expect(previewFormula('1 / speedKnot')?.[0]).toBeNull();
    expect(previewFormula('nope')).toBeNull();
  });
});

describe('access rules', () => {
  it('grants authority only in authority organizations and ais:ingest only to super admins', () => {
    expect(grantableRoles('shipping_company')).toEqual(['org_admin', 'fleet_manager', 'viewer']);
    expect(grantableRoles('authority')).toContain('authority');
    expect(grantableScopes(false)).toEqual(['telemetry:ingest', 'ais:read']);
    expect(grantableScopes(true)).toContain('ais:ingest');
  });

  it('protects the last org admin', () => {
    const members = [{ role: 'org_admin' }, { role: 'viewer' }];
    expect(isLastOrgAdmin({ role: 'org_admin' }, members)).toBe(true);
    expect(isLastOrgAdmin({ role: 'org_admin' }, [...members, { role: 'org_admin' }])).toBe(false);
    expect(isLastOrgAdmin({ role: 'viewer' }, members)).toBe(false);
  });

  it('derives DNS-label slugs', () => {
    expect(slugify('PT Pelayaran Nusantara')).toBe('pt-pelayaran-nusantara');
    expect(slugify('  KSOP Kelas I — Batam!  ')).toBe('ksop-kelas-i-batam');
    expect(slugify('Pelabuhan Benoa (Bali) Ü')).toBe('pelabuhan-benoa-bali-u');
    expect(SLUG_PATTERN.test(slugify('A'.repeat(80)))).toBe(true);
    expect(slugify('A'.repeat(80))).toHaveLength(63);
  });
});

describe('audit records', () => {
  it('keys and tones actions', () => {
    expect(actionKey('membership.invite.cancel')).toBe('audit.actions.membership__invite__cancel');
    expect(actionTone('auth.login.failed')).toBe('danger');
    expect(actionTone('api_key.revoke')).toBe('danger');
    expect(actionTone('auth.mfa.disable')).toBe('warning');
    expect(actionTone('organization.create')).toBe('success');
    expect(actionTone('membership.update')).toBe('default');
  });

  it('turns meta into changes, changed fields and facts', () => {
    expect(describeMeta({ from: 'viewer', to: 'fleet_manager' })).toEqual({
      changes: [{ key: 'value', from: 'viewer', to: 'fleet_manager' }],
      fields: [],
      entries: [],
    });
    expect(
      describeMeta({
        before: { name: 'A', kind: 'research' },
        after: { name: 'B', kind: 'research', slug: 'b' },
        republished: 3,
      }),
    ).toEqual({
      changes: [
        { key: 'name', from: 'A', to: 'B' },
        { key: 'slug', from: undefined, to: 'b' },
      ],
      fields: [],
      entries: [{ key: 'republished', value: 3 }],
    });
    expect(
      describeMeta({ fields: ['name', 'slug'], changes: { kind: { from: 'a', to: 'b' } } }),
    ).toMatchObject({
      changes: [{ key: 'kind', from: 'a', to: 'b' }],
      fields: ['name', 'slug'],
    });
    expect(describeMeta(null)).toEqual({ changes: [], fields: [], entries: [] });
  });

  it('formats values and ids', () => {
    expect(formatMetaValue(null)).toBe('—');
    expect(formatMetaValue(['ais:read'])).toBe('["ais:read"]');
    expect(shortId('0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a')).toBe('0192f0c8…5b6a');
  });
});

describe('devices', () => {
  it('classifies the last-seen time', () => {
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(connectionState({ status: 'active', lastSeenAt: '2026-11-22T09:55:00Z' }, now)).toBe(
      'online',
    );
    expect(connectionState({ status: 'active', lastSeenAt: '2026-11-22T06:00:00Z' }, now)).toBe(
      'idle',
    );
    expect(connectionState({ status: 'active', lastSeenAt: '2026-11-19T06:00:00Z' }, now)).toBe(
      'offline',
    );
    expect(connectionState({ status: 'active', lastSeenAt: null }, now)).toBe('never');
    expect(connectionState({ status: 'inactive', lastSeenAt: '2026-11-22T09:59:00Z' }, now)).toBe(
      'inactive',
    );
  });
});

describe('describeMeta per-field changes', () => {
  it('reads `{ field: { from, to } }` entries as changes and keeps other facts', () => {
    const view = describeMeta({ role: { from: 'viewer', to: 'fleet_manager' }, note: 'via VHF' });
    expect(view.changes).toEqual([{ key: 'role', from: 'viewer', to: 'fleet_manager' }]);
    expect(view.entries).toEqual([{ key: 'note', value: 'via VHF' }]);
  });
});
