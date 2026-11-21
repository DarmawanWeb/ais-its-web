import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, LinkIcon, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import type * as z from 'zod';

import { authApi } from '@/shared/auth/auth-api';
import { AUTH_PATHS } from '@/shared/auth/paths';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from '../components/password-input';
import { authErrorMessage } from '../lib/auth-errors';
import { readLinkToken } from '../lib/link-token';
import { newPasswordSchema } from '../lib/schemas';

function PasswordLinkPage({ mode }: { mode: 'reset' | 'invite' }) {
  const { t } = useTranslation('auth');
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => readLinkToken(location.hash, location.search));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => newPasswordSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const copy = mode === 'invite' ? 'invite' : 'reset';

  useEffect(() => {
    if (location.hash || location.search) void navigate(location.pathname, { replace: true });
    // strip the token from the address bar once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    setError(null);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (cause) {
      setError(authErrorMessage(cause, t));
    }
  });

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          <LinkIcon className="size-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('reset.missingToken')}</h1>
          <p className="text-sm text-muted-foreground">{t('reset.missingTokenDescription')}</p>
        </div>
        <Button asChild className="w-full">
          <Link to={AUTH_PATHS.forgotPassword}>{t('reset.requestNew')}</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CircleCheck className="size-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t(`${copy}.successTitle`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`${copy}.success`)}</p>
        </div>
        <Button asChild className="w-full" size="lg">
          <Link to={AUTH_PATHS.login}>{t('reset.goToLogin')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t(`${copy}.title`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`${copy}.subtitle`)}</p>
        {mode === 'invite' && (
          <p className="text-xs text-muted-foreground">{t('reset.subtitle')}</p>
        )}
      </div>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('reset.password')}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('reset.confirm')}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting ? t('reset.submitting') : t(`${copy}.submit`)}
          </Button>
        </form>
      </Form>
    </div>
  );
}

export function ResetPasswordPage() {
  return <PasswordLinkPage mode="reset" />;
}

export function AcceptInvitePage() {
  return <PasswordLinkPage mode="invite" />;
}
