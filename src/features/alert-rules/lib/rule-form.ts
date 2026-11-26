import type {
  AlertRuleDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
} from '@/shared/api/generated/notification/model';

import type { ChannelValue } from './channels';
import { type ConditionSelection, ruleFromSelection, selectionFromRule } from './conditions';

export const NAME_MAX = 120;
export const QUIET_MAX_MINUTES = 10_080;
export const QUIET_PRESETS = [0, 15, 60, 240, 1440] as const;
export const SEVERITIES = ['info', 'warning', 'critical'] as const;
export type MinSeverity = (typeof SEVERITIES)[number];

/** Values of the rule editor. */
export interface RuleFormValues {
  name: string;
  enabled: boolean;
  locale: 'id' | 'en';
  scope: 'org' | 'all';
  conditions: ConditionSelection;
  minSeverity: MinSeverity;
  mmsi: number[];
  zoneIds: string[];
  channels: ChannelValue[];
  quietMinutes: number;
}

export function emptyRuleValues(options: {
  scope: 'org' | 'all';
  locale: 'id' | 'en';
}): RuleFormValues {
  return {
    name: '',
    enabled: true,
    locale: options.locale,
    scope: options.scope,
    conditions: { domains: [], types: [] },
    minSeverity: 'warning',
    mmsi: [],
    zoneIds: [],
    channels: [{ type: 'email', target: '' }],
    quietMinutes: 60,
  };
}

export function ruleToValues(rule: AlertRuleDto): RuleFormValues {
  return {
    name: rule.name,
    enabled: rule.enabled,
    locale: rule.locale,
    scope: rule.scope,
    conditions: selectionFromRule(rule),
    minSeverity: rule.minSeverity,
    mmsi: [...rule.mmsi],
    zoneIds: [...rule.zoneIds],
    channels: rule.channels.map((channel) => ({ type: channel.type, target: channel.target })),
    quietMinutes: rule.quietMinutes,
  };
}

function common(values: RuleFormValues) {
  const { types, domains } = ruleFromSelection(values.conditions);
  return {
    name: values.name.trim(),
    enabled: values.enabled,
    locale: values.locale,
    types,
    domains,
    minSeverity: values.minSeverity,
    mmsi: [...new Set(values.mmsi)],
    zoneIds: [...new Set(values.zoneIds)],
    channels: values.channels.map((channel) => ({
      type: channel.type,
      target: channel.target.trim(),
    })),
    quietMinutes: Math.round(values.quietMinutes),
  };
}

/**
 * Body of `POST /alert-rules`. The scope is sent only when the writer may choose it (otherwise
 * the service decides: `org`), and `orgId` only for platform administrators creating a rule in
 * another organization. Optional members are omitted, never `null` (the API refuses `null`).
 */
export function toCreateBody(
  values: RuleFormValues,
  options: { canChooseScope: boolean; orgId?: string },
): CreateAlertRuleDto {
  return {
    ...common(values),
    ...(options.canChooseScope ? { scope: values.scope } : {}),
    ...(options.orgId ? { orgId: options.orgId } : {}),
  };
}

/** Body of `PATCH /alert-rules/:id`; the scope only when it changed and may be chosen. */
export function toUpdateBody(
  values: RuleFormValues,
  rule: AlertRuleDto,
  options: { canChooseScope: boolean },
): UpdateAlertRuleDto {
  return {
    ...common(values),
    ...(options.canChooseScope && values.scope !== rule.scope ? { scope: values.scope } : {}),
  };
}
