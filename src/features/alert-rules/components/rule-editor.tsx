import { ALERT_DOMAINS } from '@darmawanweb/ais-its-contracts/domain';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe2, Info, Save, Ship } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { type Path, type Resolver, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type { OrganizationDto } from '@/shared/api/generated/auth/model';
import type { AlertRuleDto } from '@/shared/api/generated/notification/model';
import { toApiProblem } from '@/shared/api/problem';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/sonner';

import { useCreateRule, useUpdateRule } from '../api/rules-api';
import { CHANNEL_TYPES, MAX_CHANNELS, validateChannels } from '../lib/channels';
import { problemMessage } from '@/shared/api/problem-copy';
import {
  emptyRuleValues,
  NAME_MAX,
  QUIET_MAX_MINUTES,
  QUIET_PRESETS,
  type RuleFormValues,
  ruleToValues,
  SEVERITIES,
  toCreateBody,
  toUpdateBody,
} from '../lib/rule-form';
import { canChooseScope, defaultScope, type RuleActor } from '../lib/scope';
import { ChannelsField } from './channels-field';
import { ConditionsField, SeverityField } from './conditions-field';
import { VesselFilterField, ZoneFilterField } from './filter-fields';
import { WebhookGuide } from './webhook-guide';

function EditorSection({
  title,
  description,
  hint,
  children,
  id,
}: {
  title: string;
  description?: string;
  hint?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="space-y-3 border-b pb-6 last:border-b-0" aria-labelledby={id}>
      <div className="space-y-1">
        <h3 id={id} className="flex items-center gap-1 text-sm font-semibold">
          {title} {hint}
        </h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const FIELD_PATTERN =
  /^(name|quietMinutes|mmsi|zoneIds|types|domains|minSeverity|locale|channels\.\d+\.target)$/;

/** Create or edit an alert rule (sheet). The owner organization is fixed once created. */
export function RuleEditor({
  open,
  onOpenChange,
  rule,
  actor,
  organizations,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule to edit; undefined creates a rule. */
  rule: AlertRuleDto | undefined;
  actor: RuleActor;
  /** Platform administrators choose the owner of a new rule. */
  organizations?: readonly OrganizationDto[];
  /** The saved rule as the API answered (new webhook channels carry their secret once). */
  onSaved?: (rule: AlertRuleDto) => void;
}) {
  const { t } = useTranslation('alert-rules');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 p-0 sm:max-w-2xl"
        closeLabel={t('common:actions.close')}
        aria-describedby={undefined}
      >
        {open && (
          <RuleEditorForm
            key={rule?.id ?? 'new'}
            rule={rule}
            actor={actor}
            organizations={organizations}
            onCancel={() => onOpenChange(false)}
            onDone={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RuleEditorForm({
  rule,
  actor,
  organizations,
  onCancel,
  onDone,
}: {
  rule: AlertRuleDto | undefined;
  actor: RuleActor;
  organizations?: readonly OrganizationDto[];
  onCancel: () => void;
  onDone: (saved: AlertRuleDto) => void;
}) {
  const { t, i18n } = useTranslation('alert-rules');
  const create = useCreateRule();
  const update = useUpdateRule();
  const ids = { scope: useId(), severity: useId(), conditions: useId() };
  const [formError, setFormError] = useState<{ title: string; message: string } | null>(null);
  const [ownerOrgId, setOwnerOrgId] = useState<string>(rule?.orgId ?? actor.orgId ?? '');
  const ruleOrgId = rule?.orgId ?? ownerOrgId;
  const scopeChoosable = canChooseScope(actor, ruleOrgId);

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('editor.errors.nameRequired'))
      .max(NAME_MAX, t('editor.errors.nameTooLong', { max: NAME_MAX })),
    enabled: z.boolean(),
    locale: z.enum(['id', 'en']),
    scope: z.enum(['org', 'all']),
    conditions: z.object({
      domains: z.array(z.enum(ALERT_DOMAINS)),
      types: z.array(z.string()),
    }),
    minSeverity: z.enum(SEVERITIES),
    mmsi: z.array(z.number().int()),
    zoneIds: z.array(z.string()),
    channels: z
      .array(z.object({ type: z.enum(CHANNEL_TYPES), target: z.string() }))
      .min(1, t('channels.errors.none'))
      .max(MAX_CHANNELS, t('channels.errors.tooMany', { max: MAX_CHANNELS }))
      .superRefine((channels, ctx) => {
        for (const [index, problem] of validateChannels(channels)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'target'],
            message: t(`channels.errors.${problem}`),
          });
        }
      }),
    quietMinutes: z
      .number({ error: t('editor.errors.quietInvalid', { max: QUIET_MAX_MINUTES }) })
      .int(t('editor.errors.quietInvalid', { max: QUIET_MAX_MINUTES }))
      .min(0, t('editor.errors.quietInvalid', { max: QUIET_MAX_MINUTES }))
      .max(QUIET_MAX_MINUTES, t('editor.errors.quietInvalid', { max: QUIET_MAX_MINUTES })),
  });

  const form = useForm<RuleFormValues, unknown, RuleFormValues>({
    // The schema validates exactly the editor values (readonly arrays aside).
    resolver: zodResolver(schema) as unknown as Resolver<RuleFormValues, unknown, RuleFormValues>,
    defaultValues: rule
      ? ruleToValues(rule)
      : emptyRuleValues({
          scope: defaultScope(actor, ruleOrgId),
          locale: i18n.language === 'en' ? 'en' : 'id',
        }),
  });
  const scope = useWatch({ control: form.control, name: 'scope' });
  const locale = useWatch({ control: form.control, name: 'locale' });
  const channels = useWatch({ control: form.control, name: 'channels' });
  const hasWebhook = channels.some((channel) => channel.type === 'webhook');
  const pending = create.isPending || update.isPending;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      let saved: AlertRuleDto;
      if (rule) {
        saved = await update.mutateAsync({
          id: rule.id,
          body: toUpdateBody(values, rule, { canChooseScope: scopeChoosable }),
        });
        toast.success(t('editor.saved', { name: values.name.trim() }));
      } else {
        saved = await create.mutateAsync(
          toCreateBody(values, {
            canChooseScope: scopeChoosable,
            orgId:
              actor.isPlatformAdmin && ownerOrgId && ownerOrgId !== actor.orgId
                ? ownerOrgId
                : undefined,
          }),
        );
        toast.success(t('editor.created', { name: values.name.trim() }));
      }
      onDone(saved);
    } catch (error) {
      const problem = toApiProblem(error);
      let fieldErrors = 0;
      for (const fieldError of problem.errors) {
        if (!FIELD_PATTERN.test(fieldError.field)) continue;
        form.setError(fieldError.field as Path<RuleFormValues>, {
          type: 'server',
          message: fieldError.message,
        });
        fieldErrors += 1;
      }
      if (fieldErrors === 0 || problem.code !== 'VALIDATION_FAILED') {
        setFormError({ title: t('editor.saveFailed'), message: problemMessage(t, error) });
      }
    }
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        className="flex h-full min-h-0 flex-col"
        noValidate
      >
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle>{rule ? t('editor.editTitle') : t('editor.createTitle')}</SheetTitle>
          <SheetDescription>{t('editor.description')}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <EditorSection title={t('editor.identity')}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('editor.name')}</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={NAME_MAX}
                        placeholder={t('editor.namePlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="locale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('editor.locale')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="id">{t('locales.id')}</SelectItem>
                        <SelectItem value="en">{t('locales.en')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t('editor.enabled')}</FormLabel>
                    <p className="text-xs text-muted-foreground">{t('editor.enabledHint')}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {!rule && actor.isPlatformAdmin && organizations && organizations.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-owner">{t('editor.owner')}</Label>
                <Select value={ownerOrgId} onValueChange={setOwnerOrgId}>
                  <SelectTrigger id="rule-owner" className="w-full">
                    <SelectValue placeholder={t('editor.ownerPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('editor.ownerHint')}</p>
              </div>
            )}
          </EditorSection>

          <EditorSection
            id={ids.scope}
            title={t('editor.scopeTitle')}
            description={scopeChoosable ? t('editor.scopeDescription') : undefined}
          >
            {scopeChoosable ? (
              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-2 sm:grid-cols-2"
                    aria-labelledby={ids.scope}
                  >
                    {(['all', 'org'] as const).map((value) => (
                      <Label
                        key={value}
                        htmlFor={`scope-${value}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background/40 p-3 font-normal hover:bg-accent/40',
                          field.value === value && 'border-primary/60 bg-primary/8',
                        )}
                      >
                        <RadioGroupItem id={`scope-${value}`} value={value} className="mt-0.5" />
                        <span className="space-y-0.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {value === 'all' ? (
                              <Globe2 className="size-4" aria-hidden />
                            ) : (
                              <Ship className="size-4" aria-hidden />
                            )}
                            {t(`scope.${value}`)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {t(`editor.scopeHints.${value}`)}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              />
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-background/40 p-3 text-sm">
                {scope === 'all' ? (
                  <Globe2 className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                ) : (
                  <Ship className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="space-y-0.5">
                  <p className="font-medium">{t(`scope.${scope}`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {scope === 'all' ? t('editor.scopeKeptAll') : t('editor.scopeFixedOrg')}
                  </p>
                </div>
              </div>
            )}
          </EditorSection>

          <EditorSection
            id={ids.conditions}
            title={t('editor.conditionsTitle')}
            description={t('editor.conditionsDescription')}
            hint={<MethodInfo methodId="notify.alert_rule_matching" />}
          >
            <FormField
              control={form.control}
              name="conditions"
              render={({ field }) => (
                <ConditionsField value={field.value} onChange={field.onChange} />
              )}
            />
            <div className="space-y-2">
              <p id={ids.severity} className="text-sm font-medium">
                {t('editor.severity.label')}
              </p>
              <FormField
                control={form.control}
                name="minSeverity"
                render={({ field }) => (
                  <SeverityField
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy={ids.severity}
                  />
                )}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('editor.vessels.label')}</p>
                <FormField
                  control={form.control}
                  name="mmsi"
                  render={({ field }) => (
                    <VesselFilterField
                      value={field.value}
                      onChange={field.onChange}
                      orgId={scope === 'org' ? ruleOrgId || undefined : undefined}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('editor.zones.label')}</p>
                <FormField
                  control={form.control}
                  name="zoneIds"
                  render={({ field }) => (
                    <ZoneFilterField value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          </EditorSection>

          <EditorSection
            title={t('editor.channelsTitle')}
            description={t('editor.channelsDescription')}
          >
            <ChannelsField control={form.control} locale={locale} />
            {hasWebhook && (
              <Collapsible className="rounded-lg border bg-background/40">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full justify-start">
                    <Info /> {t('webhook.toggle')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-3">
                  <WebhookGuide compact />
                </CollapsibleContent>
              </Collapsible>
            )}
          </EditorSection>

          <EditorSection
            title={t('editor.quietTitle')}
            description={t('editor.quietDescription')}
            hint={<MethodInfo methodId="notify.rule_quiet_period" />}
          >
            <FormField
              control={form.control}
              name="quietMinutes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap items-center gap-2">
                    <FormLabel className="sr-only">{t('editor.quietLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={QUIET_MAX_MINUTES}
                        step={1}
                        className="w-28 font-mono"
                        value={Number.isFinite(field.value) ? field.value : ''}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <span className="text-sm text-muted-foreground">{t('editor.minutes')}</span>
                    <div className="flex flex-wrap gap-1">
                      {QUIET_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          size="xs"
                          variant={field.value === preset ? 'subtle' : 'ghost'}
                          aria-pressed={field.value === preset}
                          onClick={() => field.onChange(preset)}
                        >
                          {t(`editor.quietPresets.${preset}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </EditorSection>
        </div>

        <SheetFooter className="gap-3 border-t bg-elevated p-4">
          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{formError.title}</AlertTitle>
              <AlertDescription>{formError.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : <Save />}{' '}
              {rule ? t('common:actions.save') : t('editor.create')}
            </Button>
          </div>
        </SheetFooter>
      </form>
    </Form>
  );
}
