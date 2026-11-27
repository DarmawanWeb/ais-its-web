import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Lock, RotateCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type { ApiKeyDto, ApiKeyWithSecretDto } from '@/shared/api/generated/auth/model';
import { toApiProblem } from '@/shared/api/problem';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';
import { Spinner } from '@/shared/ui/spinner';

import { useCreateApiKey, useRotateApiKey } from '../api/auth-admin';
import { API_KEY_SCOPES, type ApiKeyScope, grantableScopes } from '../lib/access';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';
import { CopyButton } from '@/shared/ui/copy-button';

/** Creates an API key; the full key is shown once, then only its prefix exists. */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  isPlatformAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  orgName: string | null;
  isPlatformAdmin: boolean;
}) {
  const [created, setCreated] = useState<ApiKeyWithSecretDto | null>(null);
  const [stored, setStored] = useState(false);
  const close = (next: boolean) => {
    if (!next && created && !stored) return;
    if (!next) {
      // The secret leaves memory with the dialog.
      setCreated(null);
      setStored(false);
    }
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      {open &&
        (created ? (
          <SecretStep
            apiKey={created}
            stored={stored}
            onStoredChange={setStored}
            onClose={() => close(false)}
          />
        ) : (
          <CreateStep
            orgId={orgId}
            orgName={orgName}
            isPlatformAdmin={isPlatformAdmin}
            onCreated={setCreated}
            onCancel={() => close(false)}
          />
        ))}
    </Dialog>
  );
}

function CreateStep({
  orgId,
  orgName,
  isPlatformAdmin,
  onCreated,
  onCancel,
}: {
  orgId: string | null;
  orgName: string | null;
  isPlatformAdmin: boolean;
  onCreated: (key: ApiKeyWithSecretDto) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('admin');
  const create = useCreateApiKey();
  const grantable = grantableScopes(isPlatformAdmin);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('apiKeys.form.nameRequired'))
      .max(100, t('common.tooLong', { max: 100 })),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, t('apiKeys.form.scopesRequired')),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', scopes: ['telemetry:ingest'] },
  });
  const scopes = useWatch({ control: form.control, name: 'scopes' });

  const submit = form.handleSubmit(async (values) => {
    setScopeError(null);
    try {
      const result = await create.mutateAsync({
        name: values.name.trim(),
        scopes: values.scopes,
        ...(isPlatformAdmin && orgId ? { orgId } : {}),
      });
      onCreated(result.apiKey);
    } catch (error) {
      const problem = toApiProblem(error);
      if (problem.code === 'SCOPE_NOT_GRANTABLE') setScopeError(t('problems.SCOPE_NOT_GRANTABLE'));
      else if (!applyFieldErrors(t, error, form.setError, ['name', 'scopes']))
        setScopeError(problemMessage(t, error));
    }
  });

  const toggle = (scope: ApiKeyScope, checked: boolean) =>
    form.setValue('scopes', checked ? [...scopes, scope] : scopes.filter((s) => s !== scope), {
      shouldValidate: true,
    });

  return (
    <DialogContent className="sm:max-w-lg" closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle>{t('apiKeys.form.title')}</DialogTitle>
        <DialogDescription>
          {t('apiKeys.form.description', { org: orgName ?? '—' })}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          id="api-key-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('apiKeys.form.name')}</FormLabel>
                <FormControl>
                  <Input
                    maxLength={100}
                    placeholder={t('apiKeys.form.namePlaceholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('apiKeys.form.scopes')}</legend>
            {API_KEY_SCOPES.map((scope) => {
              const allowed = grantable.includes(scope);
              const id = `scope-${scope.replace(':', '-')}`;
              return (
                <div
                  key={scope}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border bg-background/40 p-3',
                    scopes.includes(scope) && 'border-primary/60 bg-primary/8',
                    !allowed && 'opacity-70',
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={scopes.includes(scope)}
                    disabled={!allowed}
                    onCheckedChange={(checked) => toggle(scope, checked === true)}
                    aria-describedby={`${id}-hint`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={id} className="flex items-center gap-1.5 font-mono text-sm">
                      {scope}
                      {!allowed && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                    </Label>
                    <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                      {t(`apiKeys.scopes.${scope.replace(':', '_')}`)}
                      {!allowed && ` ${t('apiKeys.form.superAdminOnly')}`}
                    </p>
                  </div>
                </div>
              );
            })}
            {form.formState.errors.scopes?.message && (
              <p className="text-sm text-danger">{form.formState.errors.scopes.message}</p>
            )}
          </fieldset>
          {scopeError && (
            <Alert variant="destructive" role="alert">
              <ShieldAlert aria-hidden />
              <AlertDescription>{scopeError}</AlertDescription>
            </Alert>
          )}
        </form>
      </Form>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={create.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form="api-key-form" disabled={create.isPending || !orgId}>
          {create.isPending ? <Spinner /> : <KeyRound />} {t('apiKeys.form.submit')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function SecretStep({
  apiKey,
  stored,
  onStoredChange,
  onClose,
}: {
  apiKey: ApiKeyWithSecretDto;
  stored: boolean;
  onStoredChange: (stored: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('admin');
  return (
    <DialogContent
      className="sm:max-w-xl"
      showCloseButton={false}
      onEscapeKeyDown={(event) => !stored && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{t('apiKeys.secret.title')}</DialogTitle>
        <DialogDescription>
          {t('apiKeys.secret.description', { name: apiKey.name })}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="warning">
        <TriangleAlert aria-hidden />
        <AlertTitle>{t('apiKeys.secret.onceTitle')}</AlertTitle>
        <AlertDescription>{t('apiKeys.secret.onceText')}</AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="api-key-secret">{t('apiKeys.secret.key')}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="api-key-secret"
            readOnly
            value={apiKey.key}
            className="font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
            data-testid="api-key-secret"
          />
          <CopyButton value={apiKey.key} label={t('apiKeys.secret.copy')}>
            {t('common:actions.copy')}
          </CopyButton>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('apiKeys.secret.usage')}{' '}
          <code className="font-mono text-foreground">X-API-Key: {apiKey.prefix}_…</code>
        </p>
      </div>
      <div className="flex items-start gap-2.5 rounded-lg border bg-background/40 p-3">
        <Checkbox
          id="api-key-stored"
          checked={stored}
          onCheckedChange={(checked) => onStoredChange(checked === true)}
        />
        <Label htmlFor="api-key-stored" className="text-sm font-normal">
          {t('apiKeys.secret.stored')}
        </Label>
      </div>
      <DialogFooter>
        <Button onClick={onClose} disabled={!stored}>
          {t('apiKeys.secret.done')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Rotates a key (`POST /api-keys/:id/rotate`): a new secret for the same id and prefix, shown
 * once; the replaced secret keeps working for the grace period so devices can switch.
 */
export function RotateApiKeyDialog({
  apiKey,
  onOpenChange,
}: {
  apiKey: ApiKeyDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const rotate = useRotateApiKey();
  const [grace, setGrace] = useState('1440');
  const [rotated, setRotated] = useState<ApiKeyWithSecretDto | null>(null);
  const [stored, setStored] = useState(false);
  const close = (next: boolean) => {
    if (!next && rotated && !stored) return;
    if (!next) {
      setRotated(null);
      setStored(false);
      setGrace('1440');
    }
    onOpenChange(next);
  };
  const confirm = () => {
    if (!apiKey) return;
    rotate.mutate(
      { id: apiKey.id, gracePeriodMin: Number(grace) },
      {
        onSuccess: (result) => {
          setRotated(result.apiKey);
          toast.success(t('apiKeys.toasts.rotated', { name: apiKey.name }));
        },
        onError: (error) =>
          toast.error(t('apiKeys.toasts.rotateFailed'), {
            description: problemMessage(t, error),
          }),
      },
    );
  };
  return (
    <Dialog open={apiKey !== null} onOpenChange={close}>
      {apiKey &&
        (rotated ? (
          <SecretStep
            apiKey={rotated}
            stored={stored}
            onStoredChange={setStored}
            onClose={() => close(false)}
          />
        ) : (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('apiKeys.rotate.title', { name: apiKey.name })}</DialogTitle>
              <DialogDescription>{t('apiKeys.rotate.description')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="api-key-grace">{t('apiKeys.rotate.grace')}</Label>
              <Select value={grace} onValueChange={setGrace}>
                <SelectTrigger id="api-key-grace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['0', '60', '1440', '10080'].map((minutes) => (
                    <SelectItem key={minutes} value={minutes}>
                      {t(`apiKeys.rotate.graceOptions.${minutes}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('apiKeys.rotate.graceHint')}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={confirm} disabled={rotate.isPending}>
                <RotateCw /> {t('apiKeys.rotate.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        ))}
    </Dialog>
  );
}
