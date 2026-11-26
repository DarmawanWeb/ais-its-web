import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, CircleDashed, Eye, EyeOff, KeyRound } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { Section } from '@/shared/domain-ui/section';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import { useChangePassword } from '../api/profile-api';
import {
  checkPasswordRules,
  meetsPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  passwordStrength,
} from '../lib/password-policy';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';

function PasswordInput({
  visible,
  onToggle,
  toggleLabel,
  ...props
}: ComponentProps<typeof Input> & {
  visible: boolean;
  onToggle: () => void;
  toggleLabel: string;
}) {
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className="pr-10" {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-1/2 right-1.5 -translate-y-1/2"
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-pressed={visible}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

const STRENGTH_STYLE = {
  empty: { width: 'w-0', color: 'bg-muted' },
  weak: { width: 'w-1/4', color: 'bg-danger' },
  fair: { width: 'w-2/4', color: 'bg-warning' },
  good: { width: 'w-3/4', color: 'bg-info' },
  strong: { width: 'w-full', color: 'bg-success' },
} as const;

/** Password change (spec §13.1): the current password, then a new one meeting the policy. */
export function PasswordCard() {
  const { t } = useTranslation('profile');
  const change = useChangePassword();
  const [visible, setVisible] = useState(false);

  const schema = z
    .object({
      currentPassword: z.string().min(1, t('password.currentRequired')),
      newPassword: z
        .string()
        .max(PASSWORD_MAX_LENGTH, t('password.rules.maxLength'))
        .refine(meetsPasswordPolicy, t('password.policyNotMet')),
      confirmPassword: z.string(),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      path: ['confirmPassword'],
      message: t('password.mismatch'),
    })
    .refine((values) => values.newPassword !== values.currentPassword, {
      path: ['newPassword'],
      message: t('password.sameAsCurrent'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control: form.control, name: 'newPassword' });
  const rules = checkPasswordRules(newPassword);
  const strength = passwordStrength(newPassword);

  const submit = form.handleSubmit(async ({ currentPassword, newPassword: next }) => {
    try {
      await change.mutateAsync({ currentPassword, newPassword: next });
      form.reset();
      setVisible(false);
      toast.success(t('password.changed'), { description: t('password.changedDescription') });
    } catch (error) {
      if (!applyFieldErrors(t, error, form.setError, ['currentPassword', 'newPassword'])) {
        toast.error(t('password.failed'), { description: problemMessage(t, error) });
      }
    }
  });

  const toggle = {
    visible,
    onToggle: () => setVisible((value) => !value),
    toggleLabel: visible ? t('password.hide') : t('password.show'),
  };

  return (
    <Section title={t('password.title')} description={t('password.description')}>
      <Form {...form}>
        <form
          onSubmit={(event) => void submit(event)}
          className="grid gap-5 md:grid-cols-2"
          noValidate
        >
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password.current')}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...toggle} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password.new')}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      aria-describedby="password-rules"
                      {...toggle}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password.confirm')}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...toggle} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-dashed bg-background/40 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">{t('password.strength')}</span>
                <span className="font-medium" data-testid="password-strength">
                  {t(`password.levels.${strength.level}`)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    STRENGTH_STYLE[strength.level].width,
                    STRENGTH_STYLE[strength.level].color,
                  )}
                />
              </div>
            </div>
            <ul
              id="password-rules"
              className="space-y-1.5 text-sm"
              aria-label={t('password.rulesLabel')}
            >
              {PASSWORD_RULES.map((rule) => (
                <li key={rule} className="flex items-center gap-2">
                  {rules[rule] && newPassword ? (
                    <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span
                    className={cn(
                      rules[rule] && newPassword ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t(`password.rules.${rule}`)}
                  </span>
                  <span className="sr-only">
                    {rules[rule] && newPassword ? t('password.ruleMet') : t('password.ruleNotMet')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t('password.revokeHint')}</p>
            <Button type="submit" className="mt-auto self-start" disabled={change.isPending}>
              {change.isPending ? <Spinner /> : <KeyRound />} {t('password.submit')}
            </Button>
          </div>
        </form>
      </Form>
    </Section>
  );
}
