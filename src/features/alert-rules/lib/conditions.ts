import {
  ALERT_DOMAINS,
  ALERT_TYPE_LIST,
  type AlertDomain,
  getAlertType,
} from '@darmawanweb/ais-its-contracts/domain';

/**
 * What a rule watches, as the editor shows it: whole domains (every type of the domain,
 * future types included) and single types. The notification service matches a rule when
 * **all** non-empty lists hold (spec §13.9: `types` contains the type AND `domains` contains
 * the domain), so the editor never sends both lists at once:
 *
 *  - nothing selected            → `types: [], domains: []` (every alert)
 *  - only whole domains          → `domains: [...]`, `types: []`
 *  - any single type             → `types: [...]` (whole domains expanded), `domains: []`
 *
 * Types the catalog does not know (the vocabulary is open) are kept as they are.
 */
export interface ConditionSelection {
  readonly domains: readonly AlertDomain[];
  readonly types: readonly string[];
}

export const EMPTY_SELECTION: ConditionSelection = { domains: [], types: [] };

/** Known types of a domain, in catalog order. */
export function typesOfDomain(domain: AlertDomain): string[] {
  return ALERT_TYPE_LIST.filter((definition) => definition.domain === domain).map((d) => d.type);
}

/** The domain of a known type, or null for types the catalog does not know. */
export function domainOfType(type: string): AlertDomain | null {
  return getAlertType(type)?.domain ?? null;
}

function normalize(domains: Iterable<AlertDomain>, types: Iterable<string>): ConditionSelection {
  const whole = new Set(domains);
  const single = new Set(types);
  // A domain whose every known type is selected becomes the whole domain.
  for (const domain of ALERT_DOMAINS) {
    const known = typesOfDomain(domain);
    if (!whole.has(domain) && known.length > 0 && known.every((type) => single.has(type))) {
      whole.add(domain);
    }
  }
  for (const type of [...single]) {
    const domain = domainOfType(type);
    if (domain && whole.has(domain)) single.delete(type);
  }
  return {
    domains: ALERT_DOMAINS.filter((domain) => whole.has(domain)),
    types: [...single],
  };
}

/** Editor selection of a stored rule. */
export function selectionFromRule(rule: {
  readonly types: readonly string[];
  readonly domains: readonly string[];
}): ConditionSelection {
  const domains = rule.domains.filter((d): d is AlertDomain =>
    (ALERT_DOMAINS as readonly string[]).includes(d),
  );
  if (rule.types.length === 0) return normalize(domains, []);
  // Both lists: the rule watches the listed types of the listed domains.
  const types =
    domains.length === 0
      ? rule.types
      : rule.types.filter((type) => {
          const domain = domainOfType(type);
          return domain === null || domains.includes(domain);
        });
  return normalize([], types);
}

/** `types` / `domains` of the API for an editor selection. */
export function ruleFromSelection(selection: ConditionSelection): {
  types: string[];
  domains: AlertDomain[];
} {
  if (selection.types.length === 0) return { types: [], domains: [...selection.domains] };
  const expanded = selection.domains.flatMap(typesOfDomain);
  return { types: [...new Set([...expanded, ...selection.types])], domains: [] };
}

/** Toggles a whole domain (its single types are folded into it or cleared). */
export function toggleDomain(
  selection: ConditionSelection,
  domain: AlertDomain,
): ConditionSelection {
  const domainTypes = new Set(typesOfDomain(domain));
  const types = selection.types.filter((type) => !domainTypes.has(type));
  if (selection.domains.includes(domain)) {
    return { domains: selection.domains.filter((d) => d !== domain), types };
  }
  return normalize([...selection.domains, domain], types);
}

/** Toggles one type (a whole domain is split into its other types). */
export function toggleType(selection: ConditionSelection, type: string): ConditionSelection {
  const domain = domainOfType(type);
  if (domain && selection.domains.includes(domain)) {
    const others = typesOfDomain(domain).filter((t) => t !== type);
    return normalize(
      selection.domains.filter((d) => d !== domain),
      [...selection.types, ...others],
    );
  }
  const types = selection.types.includes(type)
    ? selection.types.filter((t) => t !== type)
    : [...selection.types, type];
  return normalize(selection.domains, types);
}

/** State of a domain checkbox: whole, some of its types, or none. */
export function domainState(
  selection: ConditionSelection,
  domain: AlertDomain,
): 'all' | 'some' | 'none' {
  if (selection.domains.includes(domain)) return 'all';
  const domainTypes = typesOfDomain(domain);
  return selection.types.some((type) => domainTypes.includes(type)) ? 'some' : 'none';
}

export function typeSelected(selection: ConditionSelection, type: string): boolean {
  const domain = domainOfType(type);
  return (domain !== null && selection.domains.includes(domain)) || selection.types.includes(type);
}

/** Selected types the catalog does not know (open vocabulary), kept untouched. */
export function unknownTypes(selection: ConditionSelection): string[] {
  return selection.types.filter((type) => domainOfType(type) === null);
}

export function isEmptySelection(selection: ConditionSelection): boolean {
  return selection.domains.length === 0 && selection.types.length === 0;
}
