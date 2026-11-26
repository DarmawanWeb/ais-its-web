import { ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { MfaSetupDto } from '@/shared/api/generated/auth/model';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { CopyButton } from '@/shared/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Skeleton } from '@/shared/ui/skeleton';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import { useMfaDisable, useMfaEnable, useMfaSetup } from '../api/profile-api';
import { formatSecret, normalizeOtp, parseOtpauthUrl } from '../lib/otpauth';
import { problemMessage } from '@/shared/api/problem-copy';
import { QrCode } from './qr-code';

function OtpField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation('profile');
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t('mfa.code')}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(normalizeOtp(event.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="h-11 text-center font-mono text-xl tracking-[0.5em] tabular-nums"
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {t('mfa.codeHint')}
        </p>
      )}
    </div>
  );
}

function SecretBox({ secret }: { secret: string }) {
  const { t } = useTranslation('profile');
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2">
      <code className="min-w-0 flex-1 font-mono text-sm leading-relaxed" data-testid="mfa-secret">
        {/* Groups wrap as a whole (never "…L / PY2…"), separated by plain spaces. */}
        {formatSecret(secret)
          .split(' ')
          .map((group, index) => (
            <Fragment key={index}>
              {index > 0 && ' '}
              <span className="whitespace-nowrap">{group}</span>
            </Fragment>
          ))}
      </code>
      <CopyButton value={secret} label={t('mfa.copySecret')} />
    </div>
  );
}

function SetupBody({ setup }: { setup: MfaSetupDto }) {
  const { t } = useTranslation('profile');
  const info = parseOtpauthUrl(setup.otpauthUrl);
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="mx-auto w-44 rounded-xl border bg-white p-2 shadow-xs sm:mx-0">
        <QrCode value={setup.otpauthUrl} label={t('mfa.qrLabel')} className="size-full" />
      </div>
      <div className="min-w-0 space-y-3 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground marker:text-foreground">
          <li>{t('mfa.steps.install')}</li>
          <li>{t('mfa.steps.scan')}</li>
          <li>{t('mfa.steps.enter')}</li>
        </ol>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('mfa.manual')}</p>
          <SecretBox secret={setup.secret} />
          {info && (
            <p className="text-xs text-muted-foreground">
              {t('mfa.manualDetails', {
                account: info.account ?? '—',
                issuer: info.issuer ?? '—',
                digits: info.digits,
                period: info.period,
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Enables TOTP MFA: POST /auth/mfa/setup when opened, then /auth/mfa/enable with a code. */
export function MfaSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The content mounts with the dialog, so every opening starts a fresh setup and form.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <MfaSetupContent onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function MfaSetupContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('profile');
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const { mutate: requestSetup } = setup;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    requestSetup();
  }, [requestSetup]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError(t('mfa.codeIncomplete'));
      return;
    }
    setError(null);
    try {
      await enable.mutateAsync(code);
      toast.success(t('mfa.enabled'), { description: t('mfa.enabledDescription') });
      onClose();
    } catch (failure) {
      setError(problemMessage(t, failure));
      setCode('');
    }
  };

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Smartphone className="size-5 text-primary" aria-hidden /> {t('mfa.setupTitle')}
        </DialogTitle>
        <DialogDescription>{t('mfa.setupDescription')}</DialogDescription>
      </DialogHeader>
      {setup.isError ? (
        <ErrorState
          error={setup.error}
          description={problemMessage(t, setup.error)}
          onRetry={() => requestSetup()}
          size="sm"
        />
      ) : setup.data ? (
        <form id="mfa-enable-form" onSubmit={(event) => void submit(event)} className="space-y-5">
          <SetupBody setup={setup.data} />
          <OtpField value={code} onChange={setCode} error={error} disabled={enable.isPending} />
        </form>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]" aria-busy>
          <Skeleton className="mx-auto size-44 rounded-xl sm:mx-0" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={enable.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form="mfa-enable-form" disabled={!setup.data || enable.isPending}>
          {enable.isPending ? <Spinner /> : <ShieldCheck />} {t('mfa.enable')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Disables MFA with a current code (POST /auth/mfa/disable). */
export function MfaDisableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <MfaDisableContent onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function MfaDisableContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('profile');
  const disable = useMfaDisable();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError(t('mfa.codeIncomplete'));
      return;
    }
    setError(null);
    try {
      await disable.mutateAsync(code);
      toast.success(t('mfa.disabled'));
      onClose();
    } catch (failure) {
      setError(problemMessage(t, failure));
      setCode('');
    }
  };

  return (
    <DialogContent closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldOff className="size-5 text-danger" aria-hidden /> {t('mfa.disableTitle')}
        </DialogTitle>
        <DialogDescription>{t('mfa.disableDescription')}</DialogDescription>
      </DialogHeader>
      <form id="mfa-disable-form" onSubmit={(event) => void submit(event)} className="space-y-4">
        <Alert variant="warning">
          <AlertDescription>{t('mfa.disableWarning')}</AlertDescription>
        </Alert>
        <OtpField value={code} onChange={setCode} error={error} disabled={disable.isPending} />
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={disable.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button
          type="submit"
          form="mfa-disable-form"
          variant="destructive"
          disabled={disable.isPending}
        >
          {disable.isPending ? <Spinner /> : <ShieldOff />} {t('mfa.disable')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
