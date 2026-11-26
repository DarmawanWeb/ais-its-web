import { Check, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/shared/auth/hooks';
import { Can } from '@/shared/auth/guards';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import type { AlertDto } from '@/shared/api/generated/notification/model';
import { Button } from '@/shared/ui/button';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import { useAlertTransition } from '../api/alerts';

/**
 * Acknowledge / resolve of one alert (permission `alert:ack`, spec §8.4 — hidden without it).
 * Resolving closes the occurrence for every user of the organization, so it asks first.
 */
export function AlertActions({
  alert,
  variant = 'row',
}: {
  alert: Pick<AlertDto, 'id' | 'status' | 'title'>;
  variant?: 'row' | 'detail';
}) {
  const { t } = useTranslation('alerts');
  const { userId } = useSession();
  const transition = useAlertTransition(userId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pending = transition.isPending;
  const canAcknowledge = alert.status === 'open';
  const canResolve = alert.status !== 'resolved';

  const acknowledge = () => transition.mutate({ id: alert.id, action: 'acknowledge' });
  const resolve = () => transition.mutate({ id: alert.id, action: 'resolve' });

  const dialog = (
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title={t('actions.resolveConfirmTitle')}
      description={t('actions.resolveConfirmDescription', { title: alert.title })}
      confirmLabel={t('actions.resolve')}
      onConfirm={resolve}
    />
  );

  if (variant === 'detail') {
    return (
      <Can permission="alert:ack">
        <div className="flex flex-wrap gap-2">
          {canAcknowledge && (
            <Button size="sm" onClick={acknowledge} disabled={pending}>
              <Check /> {t('actions.acknowledge')}
            </Button>
          )}
          {canResolve && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
            >
              <CheckCheck /> {t('actions.resolve')}
            </Button>
          )}
        </div>
        {dialog}
      </Can>
    );
  }

  if (!canAcknowledge && !canResolve) return null;
  return (
    <Can permission="alert:ack">
      {/* Row actions (and their portaled dialog) must not open the detail of the row. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="flex justify-end gap-1"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {canAcknowledge && (
          <SimpleTooltip label={t('actions.acknowledge')}>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={acknowledge}
              disabled={pending}
              aria-label={`${t('actions.acknowledge')}: ${alert.title}`}
              data-testid="alert-acknowledge"
            >
              <Check />
            </Button>
          </SimpleTooltip>
        )}
        {canResolve && (
          <SimpleTooltip label={t('actions.resolve')}>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
              aria-label={`${t('actions.resolve')}: ${alert.title}`}
              data-testid="alert-resolve"
            >
              <CheckCheck />
            </Button>
          </SimpleTooltip>
        )}
        {dialog}
      </div>
    </Can>
  );
}
