/**
 * Rule scopes of the notification service (services/notification/src/modules/rules/rule-scope.ts):
 * `org` watches the vessels of the rule's organization, `all` every vessel. A principal "acts
 * as authority of" an organization when it is the active organization and the token holds the
 * `authority` role there (auth grants that role only in organizations of kind `authority`).
 *
 *  - setting `all` on a rule that is not `all` yet needs authority of the rule's organization;
 *  - changing a rule that is `all` (anything: channels, criteria, scope) needs authority of
 *    its organization or a platform administrator;
 *  - a new rule without a scope gets `all` when its writer acts as authority, else `org`.
 */
export interface RuleActor {
  readonly orgId: string | null;
  readonly roles: readonly string[];
  readonly isPlatformAdmin: boolean;
}

export function actsAsAuthorityOf(actor: RuleActor, orgId: string): boolean {
  return actor.orgId === orgId && actor.roles.includes('authority');
}

/** The scope selector is offered (the writer may choose `all`). */
export function canChooseScope(actor: RuleActor, ruleOrgId: string): boolean {
  return actsAsAuthorityOf(actor, ruleOrgId);
}

/** Default scope of a new rule of `ruleOrgId` (what the server would pick). */
export function defaultScope(actor: RuleActor, ruleOrgId: string): 'org' | 'all' {
  return actsAsAuthorityOf(actor, ruleOrgId) ? 'all' : 'org';
}

/** The actor may change (edit, toggle, delete) this rule. */
export function canModifyRule(
  actor: RuleActor,
  rule: { readonly orgId: string; readonly scope: string },
): boolean {
  if (rule.scope !== 'all') return true;
  return actsAsAuthorityOf(actor, rule.orgId) || actor.isPlatformAdmin;
}
