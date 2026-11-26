import { KeyRound, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
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

import type { RevealedSecret } from '../lib/channels';

/**
 * The signing secrets of webhook channels, shown exactly once (notification 0.2: in the response
 * that created the key). The dialog closes only after the user confirms they stored them.
 */
export function SigningSecretDialog({
  ruleName,
  secrets,
  onClose,
}: {
  ruleName: string;
  /** Empty = closed. */
  secrets: readonly RevealedSecret[];
  onClose: () => void;
}) {
  const open = secrets.length > 0;
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      {open && <SecretContent ruleName={ruleName} secrets={secrets} onClose={onClose} />}
    </Dialog>
  );
}

function SecretContent({
  ruleName,
  secrets,
  onClose,
}: {
  ruleName: string;
  secrets: readonly RevealedSecret[];
  onClose: () => void;
}) {
  const { t } = useTranslation('alert-rules');
  const [stored, setStored] = useState(false);
  const storedId = useId();
  const baseId = useId();
  return (
    <DialogContent
      className="sm:max-w-xl"
      showCloseButton={false}
      onEscapeKeyDown={(event) => !stored && event.preventDefault()}
      onPointerDownOutside={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{t('secret.title')}</DialogTitle>
        <DialogDescription>
          {t('secret.description', { name: ruleName, count: secrets.length })}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="warning">
        <TriangleAlert aria-hidden />
        <AlertTitle>{t('secret.onceTitle')}</AlertTitle>
        <AlertDescription>{t('secret.onceText')}</AlertDescription>
      </Alert>
      <ul className="min-w-0 space-y-4">
        {secrets.map((item, position) => {
          const inputId = `${baseId}-${position}`;
          return (
            <li
              key={item.index}
              className="min-w-0 space-y-2 rounded-lg border bg-background/40 p-3"
            >
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate font-mono text-xs" title={item.target}>
                  {item.target}
                </span>
              </p>
              <Label htmlFor={inputId}>{t('secret.secret')}</Label>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id={inputId}
                  readOnly
                  value={item.secret}
                  className="min-w-0 font-mono text-sm"
                  onFocus={(event) => event.currentTarget.select()}
                  data-testid="webhook-signing-secret"
                />
                <CopyButton value={item.secret} label={t('secret.copy')}>
                  {t('common:actions.copy')}
                </CopyButton>
              </div>
              {item.keyId && (
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{t('secret.keyId')}</span>
                  <code className="min-w-0 font-mono break-all text-foreground">{item.keyId}</code>
                  <CopyButton value={item.keyId} label={t('secret.copyKeyId')} size="icon-xs" />
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t('secret.usage')}</p>
      <div className="flex items-start gap-2.5 rounded-lg border bg-background/40 p-3">
        <Checkbox
          id={storedId}
          checked={stored}
          onCheckedChange={(checked) => setStored(checked === true)}
        />
        <Label htmlFor={storedId} className="text-sm font-normal">
          {t('secret.stored', { count: secrets.length })}
        </Label>
      </div>
      <DialogFooter>
        <Button onClick={onClose} disabled={!stored}>
          {t('secret.done')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
