import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck, Send, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type * as z from 'zod';

import { authApi } from '@/shared/auth/auth-api';
import { AUTH_PATHS } from '@/shared/auth/paths';
import { useCountdown } from '@/shared/hooks/use-countdown';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { authErrorMessage, retryAt } from '../lib/auth-errors';
import { emailSchema } from '../lib/schemas';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const seconds = useCountdown(lockedUntil);
  const schema = useMemo(() => emailSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (cause) {
      const until = retryAt(cause);
      if (until) setLockedUntil(until);
      setError(authErrorMessage(cause, t));
    }
  });

  if (sentTo) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <MailCheck className="size-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('forgot.successTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('forgot.success', { email: sentTo })}</p>
        </div>
        <Button variant="outline" asChild className="w-full">
          <Link to={AUTH_PATHS.login}>
            <ArrowLeft /> {t('forgot.backToLogin')}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('forgot.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('forgot.subtitle')}</p>
      </div>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('login.email')}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder={t('login.emailPlaceholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant={seconds > 0 ? 'warning' : 'destructive'}>
              <ShieldAlert />
              <AlertDescription>
                {seconds > 0 ? t('errors.throttled', { seconds }) : error}
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={form.formState.isSubmitting || seconds > 0}
          >
            {form.formState.isSubmitting ? <Spinner /> : <Send />}
            {form.formState.isSubmitting ? t('forgot.submitting') : t('forgot.submit')}
          </Button>
          <Button variant="ghost" asChild className="w-full">
            <Link to={AUTH_PATHS.login}>
              <ArrowLeft /> {t('forgot.backToLogin')}
            </Link>
          </Button>
        </form>
      </Form>
    </div>
  );
}
