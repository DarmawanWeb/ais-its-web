import {
  ALERT_DOMAIN_LABELS,
  ALERT_DOMAINS,
  ALERT_SEVERITY_LABELS,
  getAlertType,
} from '@darmawanweb/ais-its-contracts/domain';
import { Anchor, Radar, X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';

import { useAppLanguage } from '@/shared/i18n';
import {
  type ConditionSelection,
  domainState,
  isEmptySelection,
  toggleDomain,
  toggleType,
  typeSelected,
  typesOfDomain,
  unknownTypes,
} from '../lib/conditions';
import { type MinSeverity, SEVERITIES } from '../lib/rule-form';

const DOMAIN_ICONS = { safety: Anchor, surveillance: Radar } as const;

/** Domains and types a rule watches, grouped by domain (empty = every alert). */
export function ConditionsField({
  value,
  onChange,
}: {
  value: ConditionSelection;
  onChange: (value: ConditionSelection) => void;
}) {
  const { t } = useTranslation('alert-rules');
  const locale = useAppLanguage();
  const id = useId();
  const others = unknownTypes(value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" id={`${id}-summary`} aria-live="polite">
          {isEmptySelection(value)
            ? t('editor.conditions.everything')
            : value.types.length === 0
              ? t('editor.conditions.wholeDomains')
              : t('editor.conditions.someTypes')}
        </p>
        {!isEmptySelection(value) && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange({ domains: [], types: others })}
          >
            <X /> {t('editor.conditions.clear')}
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ALERT_DOMAINS.map((domain) => {
          const state = domainState(value, domain);
          const Icon = DOMAIN_ICONS[domain];
          const domainId = `${id}-${domain}`;
          return (
            <fieldset
              key={domain}
              className={cn(
                'rounded-lg border bg-background/40 p-3 transition-colors',
                state !== 'none' && 'border-primary/40 bg-primary/5',
              )}
            >
              <legend className="sr-only">{ALERT_DOMAIN_LABELS[domain][locale]}</legend>
              <div className="flex items-center gap-2.5 border-b pb-2.5">
                <Checkbox
                  id={domainId}
                  checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                  onCheckedChange={() => onChange(toggleDomain(value, domain))}
                />
                <Icon className="size-4 text-primary" aria-hidden />
                <Label htmlFor={domainId} className="flex-1 cursor-pointer font-semibold">
                  {ALERT_DOMAIN_LABELS[domain][locale]}
                </Label>
                {state === 'all' && (
                  <Badge variant="primary" className="text-[10px]">
                    {t('editor.conditions.allTypes')}
                  </Badge>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {typesOfDomain(domain).map((type) => {
                  const definition = getAlertType(type);
                  const typeId = `${id}-${type}`;
                  return (
                    <li key={type} className="flex items-start gap-2.5 rounded-md px-1 py-1.5">
                      <Checkbox
                        id={typeId}
                        checked={typeSelected(value, type)}
                        onCheckedChange={() => onChange(toggleType(value, type))}
                        aria-describedby={`${typeId}-description`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Label htmlFor={typeId} className="cursor-pointer text-sm font-medium">
                          {definition?.label[locale] ?? type}
                        </Label>
                        <p id={`${typeId}-description`} className="text-xs text-muted-foreground">
                          {definition?.description[locale]}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {t('editor.conditions.otherTypes')}
          {others.map((type) => (
            <Badge key={type} variant="outline" className="font-mono">
              {type}
            </Badge>
          ))}
        </p>
      )}
    </div>
  );
}

const SEVERITY_STYLES: Record<MinSeverity, string> = {
  info: 'data-[state=checked]:border-info/60 data-[state=checked]:bg-info/10',
  warning: 'data-[state=checked]:border-warning/60 data-[state=checked]:bg-warning/10',
  critical: 'data-[state=checked]:border-danger/60 data-[state=checked]:bg-danger/10',
};

/** Minimum severity (`info < warning < critical`). */
export function SeverityField({
  value,
  onChange,
  labelledBy,
}: {
  value: MinSeverity;
  onChange: (value: MinSeverity) => void;
  labelledBy: string;
}) {
  const { t } = useTranslation('alert-rules');
  const locale = useAppLanguage();
  const id = useId();
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as MinSeverity)}
      className="grid gap-2 sm:grid-cols-3"
      aria-labelledby={labelledBy}
    >
      {SEVERITIES.map((severity) => (
        <Label
          key={severity}
          htmlFor={`${id}-${severity}`}
          data-state={value === severity ? 'checked' : 'unchecked'}
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background/40 p-3 font-normal transition-colors hover:bg-accent/40',
            SEVERITY_STYLES[severity],
          )}
        >
          <RadioGroupItem id={`${id}-${severity}`} value={severity} className="mt-0.5" />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">
              ≥ {ALERT_SEVERITY_LABELS[severity][locale]}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(`editor.severity.hints.${severity}`)}
            </span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
