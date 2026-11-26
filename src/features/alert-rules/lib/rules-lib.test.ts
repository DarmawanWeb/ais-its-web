import { describe, expect, it } from 'vitest';

import type { AlertRuleDto } from '@/shared/api/generated/notification/model';

import { countChannels, shortTarget, validateChannels, validateTarget } from './channels';
import {
  domainState,
  EMPTY_SELECTION,
  ruleFromSelection,
  selectionFromRule,
  toggleDomain,
  toggleType,
  typeSelected,
  unknownTypes,
} from './conditions';
import { emptyRuleValues, ruleToValues, toCreateBody, toUpdateBody } from './rule-form';
import { canChooseScope, canModifyRule, defaultScope } from './scope';

const ORG = '0192f0c8-7d3a-7c2e-9a1b-000000000002';

describe('conditions', () => {
  it('maps nothing to every alert and whole domains to domains only', () => {
    expect(ruleFromSelection(EMPTY_SELECTION)).toEqual({ types: [], domains: [] });
    const safety = toggleDomain(EMPTY_SELECTION, 'safety');
    expect(domainState(safety, 'safety')).toBe('all');
    expect(ruleFromSelection(safety)).toEqual({ types: [], domains: ['safety'] });
  });

  it('never sends both lists: single types expand whole domains into types', () => {
    const selection = toggleType(toggleDomain(EMPTY_SELECTION, 'safety'), 'dark');
    expect(domainState(selection, 'surveillance')).toBe('some');
    expect(ruleFromSelection(selection)).toEqual({
      types: ['ews', 'collision', 'dark'],
      domains: [],
    });
  });

  it('splits a whole domain when one of its types is unchecked, and folds it back', () => {
    const whole = toggleDomain(EMPTY_SELECTION, 'safety');
    const split = toggleType(whole, 'ews');
    expect(split).toEqual({ domains: [], types: ['collision'] });
    expect(typeSelected(split, 'ews')).toBe(false);
    expect(toggleType(split, 'ews')).toEqual({ domains: ['safety'], types: [] });
  });

  it('reads stored rules, including both lists and unknown types', () => {
    expect(selectionFromRule({ types: [], domains: ['surveillance'] })).toEqual({
      domains: ['surveillance'],
      types: [],
    });
    // Both lists: only the listed types of the listed domains match.
    expect(
      selectionFromRule({ types: ['ews', 'dark', 'future_type'], domains: ['surveillance'] }),
    ).toEqual({ domains: [], types: ['dark', 'future_type'] });
    const selection = selectionFromRule({ types: ['future_type'], domains: [] });
    expect(unknownTypes(selection)).toEqual(['future_type']);
    expect(ruleFromSelection(selection)).toEqual({ types: ['future_type'], domains: [] });
  });
});

describe('channels', () => {
  it('validates targets per channel type', () => {
    expect(validateTarget('email', 'ops@pelni.test')).toBeNull();
    expect(validateTarget('email', 'ops@')).toBe('email');
    expect(validateTarget('telegram', '-1001234567890')).toBeNull();
    expect(validateTarget('telegram', '@ksop_batam')).toBeNull();
    expect(validateTarget('telegram', 'ksop batam')).toBe('telegram');
    expect(validateTarget('webhook', 'https://ops.pelni.test/hooks/ais')).toBeNull();
    expect(validateTarget('webhook', 'ftp://ops.pelni.test')).toBe('webhookUrl');
    expect(validateTarget('webhook', 'https://user:secret@ops.pelni.test')).toBe(
      'webhookCredentials',
    );
    expect(validateTarget('webhook', '   ')).toBe('required');
  });

  it('flags duplicates and counts channels', () => {
    const channels = [
      { type: 'email', target: 'ops@pelni.test', keyId: null, signingSecret: null },
      { type: 'email', target: 'OPS@pelni.test ', keyId: null, signingSecret: null },
      {
        type: 'webhook',
        target: 'https://ops.pelni.test/hooks/ais',
        keyId: null,
        signingSecret: null,
      },
    ] as const;
    expect([...validateChannels([...channels])]).toEqual([[1, 'duplicate']]);
    expect(countChannels(channels)).toEqual({ email: 2, telegram: 0, webhook: 1 });
    expect(shortTarget(channels[2])).toBe('ops.pelni.test/hooks/ais');
  });
});

describe('scope', () => {
  const authority = { orgId: ORG, roles: ['authority'], isPlatformAdmin: false };
  const admin = { orgId: ORG, roles: ['org_admin'], isPlatformAdmin: false };
  const platform = { orgId: 'other', roles: ['super_admin'], isPlatformAdmin: true };

  it('lets only authority members of the rule organization choose "all"', () => {
    expect(canChooseScope(authority, ORG)).toBe(true);
    expect(defaultScope(authority, ORG)).toBe('all');
    expect(canChooseScope(admin, ORG)).toBe(false);
    expect(defaultScope(admin, ORG)).toBe('org');
    expect(canChooseScope(platform, ORG)).toBe(false);
  });

  it('protects rules watching every vessel', () => {
    const rule = { orgId: ORG, scope: 'all' };
    expect(canModifyRule(authority, rule)).toBe(true);
    expect(canModifyRule(admin, rule)).toBe(false);
    expect(canModifyRule(platform, rule)).toBe(true);
    expect(canModifyRule(admin, { orgId: ORG, scope: 'org' })).toBe(true);
  });
});

describe('rule form', () => {
  const RULE: AlertRuleDto = {
    id: '0192f0c8-7d3a-7c2e-9a20-000000000001',
    orgId: ORG,
    createdBy: '0192f0c8-7d3a-7c2e-9a1b-1f2e3d4c5b6a',
    name: 'EWS kritis',
    scope: 'all',
    types: ['ews'],
    domains: [],
    minSeverity: 'critical',
    mmsi: [525005223],
    zoneIds: [],
    channels: [{ type: 'telegram', target: '-1001234567890', keyId: null, signingSecret: null }],
    locale: 'id',
    quietMinutes: 30,
    enabled: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  it('builds create bodies without null members and with the scope only when choosable', () => {
    const values = {
      ...emptyRuleValues({ scope: 'org', locale: 'en' }),
      name: '  Kapal gelap  ',
      channels: [{ type: 'email' as const, target: ' ops@pelni.test ' }],
    };
    const body = toCreateBody(values, { canChooseScope: false });
    expect(body).toEqual({
      name: 'Kapal gelap',
      enabled: true,
      locale: 'en',
      types: [],
      domains: [],
      minSeverity: 'warning',
      mmsi: [],
      zoneIds: [],
      channels: [{ type: 'email', target: 'ops@pelni.test' }],
      quietMinutes: 60,
    });
    expect(
      toCreateBody({ ...values, scope: 'all' }, { canChooseScope: true, orgId: ORG }),
    ).toMatchObject({
      scope: 'all',
      orgId: ORG,
    });
  });

  it('round-trips a stored rule and sends the scope only when changed', () => {
    const values = ruleToValues(RULE);
    expect(values.conditions).toEqual({ domains: [], types: ['ews'] });
    expect(toUpdateBody(values, RULE, { canChooseScope: true })).not.toHaveProperty('scope');
    expect(toUpdateBody({ ...values, scope: 'org' }, RULE, { canChooseScope: true })).toMatchObject(
      {
        scope: 'org',
        types: ['ews'],
      },
    );
    expect(
      toUpdateBody({ ...values, scope: 'org' }, RULE, { canChooseScope: false }),
    ).not.toHaveProperty('scope');
  });
});
