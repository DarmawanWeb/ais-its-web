import { ShieldAlert, ShieldCheck, ShieldOff, ShieldPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Section } from '@/shared/domain-ui/section';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { MfaDisableDialog, MfaSetupDialog } from './mfa-dialogs';

/** Two-step verification (TOTP, spec §13.1): status, enable with a QR code, disable with a code. */
export function MfaCard({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('profile');
  const [dialog, setDialog] = useState<'setup' | 'disable' | null>(null);
  const Icon = enabled ? ShieldCheck : ShieldAlert;

  return (
    <Section
      title={t('mfa.title')}
      description={t('mfa.description')}
      actions={
        <Badge variant={enabled ? 'success' : 'warning'} data-testid="mfa-status">
          {enabled ? t('mfa.statusOn') : t('mfa.statusOff')}
        </Badge>
      }
    >
      <div
        className={cn(
          'flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center',
          enabled ? 'border-success/30 bg-success/8' : 'border-warning/35 bg-warning/8',
        )}
      >
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            enabled ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{enabled ? t('mfa.onTitle') : t('mfa.offTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {enabled ? t('mfa.onText') : t('mfa.offText')}
          </p>
        </div>
        {enabled ? (
          <Button variant="outline" onClick={() => setDialog('disable')} className="shrink-0">
            <ShieldOff /> {t('mfa.disable')}
          </Button>
        ) : (
          <Button onClick={() => setDialog('setup')} className="shrink-0">
            <ShieldPlus /> {t('mfa.enableAction')}
          </Button>
        )}
      </div>
      <MfaSetupDialog
        open={dialog === 'setup'}
        onOpenChange={(open) => setDialog(open ? 'setup' : null)}
      />
      <MfaDisableDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => setDialog(open ? 'disable' : null)}
      />
    </Section>
  );
}
