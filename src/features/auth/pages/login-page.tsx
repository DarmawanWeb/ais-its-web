import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Info, KeyRound, LogIn, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type * as z from 'zod';

import { useSession } from '@/shared/auth/hooks';
import { AUTH_PATHS, safeRedirect } from '@/shared/auth/paths';
import { login, verifyMfa } from '@/shared/auth/session';
import { toApiProblem } from '@/shared/api/problem';
import { useCountdown } from '@/shared/hooks/use-countdown';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { PasswordInput } from '../components/password-input';
import { authErrorMessage, retryAt } from '../lib/auth-errors';
import { loginSchema, mfaSchema } from '../lib/schemas';

function ThrottleAlert({ until }: { until: number }) {
  const { t } = useTranslation('auth');
  const seconds = useCountdown(until);
  if (seconds <= 0) return null;
  return (
    <Alert variant="warning" data-testid="throttle-alert">
      <ShieldAlert />
      <AlertDescription>{t('errors.throttled', { seconds })}</AlertDescription>
    </Alert>
  );
}

function CredentialsStep({
  onMfa,
  onSuccess,
}: {
  onMfa: (token: string) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation('auth');
  const { endReason } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const locked = useCountdown(lockedUntil) > 0;
  const schema = useMemo(() => loginSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const outcome = await login(values.email, values.password);
      if (outcome.status === 'mfa') onMfa(outcome.mfaToken);
      else onSuccess();
    } catch (cause) {
      const until = retryAt(cause);
      if (until) setLockedUntil(until);
      else setError(authErrorMessage(cause, t));
      form.setValue('password', '');
    }
  });

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
      </div>
      {endReason && !error && (
        <Alert variant={endReason === 'expired' ? 'warning' : 'info'}>
          <Info />
          <AlertDescription>
            {endReason === 'expired' ? t('login.sessionExpired') : t('login.loggedOut')}
          </AlertDescription>
        </Alert>
      )}
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
                    autoComplete="username"
                    inputMode="email"
                    placeholder={t('login.emailPlaceholder')}
                    // Single-purpose page: focusing the first field saves a click for every sign-in.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t('login.password')}</FormLabel>
                  <Link
                    to={AUTH_PATHS.forgotPassword}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t('login.forgot')}
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant="destructive" data-testid="login-error">
              <ShieldAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {lockedUntil && <ThrottleAlert until={lockedUntil} />}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={form.formState.isSubmitting || locked}
          >
            {form.formState.isSubmitting ? <Spinner /> : <LogIn />}
            {form.formState.isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Form>
      <p className="text-center text-xs text-muted-foreground">{t('login.help')}</p>
    </div>
  );
}

function MfaStep({
  mfaToken,
  onBack,
  onSuccess,
}: {
  mfaToken: string;
  onBack: (expired?: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation('auth');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const locked = useCountdown(lockedUntil) > 0;
  const schema = useMemo(() => mfaSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  const submit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await verifyMfa(mfaToken, code);
      onSuccess();
    } catch (cause) {
      const problem = toApiProblem(cause);
      if (problem.code === 'INVALID_TOKEN' || problem.code === 'UNAUTHORIZED') {
        onBack(true);
        return;
      }
      const until = retryAt(cause);
      if (until) setLockedUntil(until);
      else setError(authErrorMessage(cause, t));
      form.setValue('code', '');
    }
  });

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <KeyRound className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t('mfa.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('mfa.subtitle')}</p>
      </div>
      <Form {...form}>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('mfa.code')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
                      field.onChange(digits);
                      if (digits.length === 6 && !form.formState.isSubmitting && !locked)
                        void submit();
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    // The code step follows a submit; keep the keyboard on the only field.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    placeholder="••••••"
                    className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant="destructive" data-testid="mfa-error">
              <ShieldAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {lockedUntil && <ThrottleAlert until={lockedUntil} />}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={form.formState.isSubmitting || locked}
          >
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting ? t('mfa.submitting') : t('mfa.submit')}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onBack()}>
            <ArrowLeft /> {t('mfa.back')}
          </Button>
        </form>
      </Form>
    </div>
  );
}

/** Sign-in: e-mail/password, then the TOTP step when MFA is enabled (spec §13.1). */
export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = () => void navigate(safeRedirect(params.get('redirect')), { replace: true });

  if (mfaToken) {
    return (
      <MfaStep
        mfaToken={mfaToken}
        onSuccess={done}
        onBack={(expired) => {
          setMfaToken(null);
          setNotice(expired ? t('mfa.expired') : null);
        }}
      />
    );
  }
  return (
    <>
      {notice && (
        <Alert variant="warning" className="mb-6">
          <Info />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <CredentialsStep onMfa={setMfaToken} onSuccess={done} />
    </>
  );
}
