import { CircleAlert, CircleCheck, CircleDashed, Clock3, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  AlertRuleDto,
  TestNotificationResultDto,
} from '@/shared/api/generated/notification/model';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';

import { useTestNotification } from '../api/rules-api';
import { shortTarget } from '../lib/channels';
import { problemMessage } from '@/shared/api/problem-copy';
import { ChannelIcon } from './rule-bits';

type Outcome = TestNotificationResultDto | { status: 'error'; error: string } | 'pending';

function OutcomeText({ outcome }: { outcome: Outcome | undefined }) {
  const { t } = useTranslation('alert-rules');
  if (outcome === undefined)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashed className="size-3.5" aria-hidden /> {t('test.notSent')}
      </span>
    );
  if (outcome === 'pending')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Spinner className="size-3" /> {t('channels.test.sending')}
      </span>
    );
  if (outcome.status === 'sent')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <CircleCheck className="size-3.5" aria-hidden /> {t('channels.test.sent')}
      </span>
    );
  if (outcome.status === 'queued')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info">
        <Clock3 className="size-3.5" aria-hidden /> {t('channels.test.queued')}
      </span>
    );
  return (
    <span className="inline-flex items-start gap-1 text-xs text-danger">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      {t('channels.test.failed')}
      {outcome.error ? `: ${outcome.error}` : ''}
    </span>
  );
}

/** Sends a test notification to every channel of a rule (POST /notifications/test each). */
export function TestRuleDialog({
  rule,
  onOpenChange,
}: {
  rule: AlertRuleDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('alert-rules');
  const test = useTestNotification();
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [running, setRunning] = useState(false);

  const close = (open: boolean) => {
    if (running) return;
    if (!open) setOutcomes({});
    onOpenChange(open);
  };

  const sendAll = async () => {
    if (!rule) return;
    setRunning(true);
    // One after the other: the service throttles test notifications per user (10 / 10 min).
    for (const [index, channel] of rule.channels.entries()) {
      setOutcomes((current) => ({ ...current, [index]: 'pending' }));
      try {
        const result = await test.mutateAsync({
          channel: channel.type,
          target: channel.target,
          locale: rule.locale,
        });
        setOutcomes((current) => ({ ...current, [index]: result }));
      } catch (error) {
        setOutcomes((current) => ({
          ...current,
          [index]: { status: 'error', error: problemMessage(t, error) },
        }));
      }
    }
    setRunning(false);
  };

  return (
    <Dialog open={rule !== null} onOpenChange={close}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('test.title')}</DialogTitle>
          <DialogDescription>
            {rule ? t('test.description', { name: rule.name }) : ''}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2" aria-label={t('test.listLabel')}>
          {rule?.channels.map((channel, index) => (
            <li
              key={`${channel.type}-${index}`}
              className="flex flex-col gap-1 rounded-lg border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <ChannelIcon type={channel.type} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t(`channels.types.${channel.type}`)}
                </span>
                <span className="truncate font-mono text-xs">{shortTarget(channel)}</span>
              </span>
              <OutcomeText outcome={outcomes[index]} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t('test.hint')}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={running}>
            {t('common:actions.close')}
          </Button>
          <Button onClick={() => void sendAll()} disabled={running || !rule}>
            {running ? <Spinner /> : <Send />} {t('test.sendAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
