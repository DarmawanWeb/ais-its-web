import { CircleAlert, CircleCheck, Clock3, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { type Control, Controller, useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { TestNotificationResultDto } from '@/shared/api/generated/notification/model';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import { useTestNotification } from '../api/rules-api';
import {
  CHANNEL_TYPES,
  type ChannelType,
  isInsecureWebhook,
  MAX_CHANNELS,
  MAX_TARGET_LENGTH,
  validateTarget,
} from '../lib/channels';
import { problemMessage } from '@/shared/api/problem-copy';
import type { RuleFormValues } from '../lib/rule-form';
import { ChannelIcon } from './rule-bits';

type TestState =
  | { status: 'pending' }
  | { status: 'done'; result: TestNotificationResultDto }
  | { status: 'error'; message: string };

function TestResult({ state }: { state: TestState | undefined }) {
  const { t } = useTranslation('alert-rules');
  if (!state) return null;
  if (state.status === 'pending') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Spinner className="size-3" /> {t('channels.test.sending')}
      </p>
    );
  }
  if (state.status === 'error' || state.result.status === 'failed') {
    const message = state.status === 'error' ? state.message : (state.result.error ?? '');
    return (
      <p className="flex items-start gap-1.5 text-xs text-danger" role="status">
        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
        {t('channels.test.failed')}
        {message ? `: ${message}` : ''}
      </p>
    );
  }
  const queued = state.result.status === 'queued';
  return (
    <p
      className={cn('flex items-center gap-1.5 text-xs', queued ? 'text-info' : 'text-success')}
      role="status"
    >
      {queued ? (
        <Clock3 className="size-3.5" aria-hidden />
      ) : (
        <CircleCheck className="size-3.5" aria-hidden />
      )}
      {queued ? t('channels.test.queued') : t('channels.test.sent')}
    </p>
  );
}

/** Channels of a rule (1–10): type, target and a test notification per channel. */
export function ChannelsField({
  control,
  locale,
}: {
  control: Control<RuleFormValues>;
  locale: 'id' | 'en';
}) {
  const { t } = useTranslation('alert-rules');
  const { fields, append, remove } = useFieldArray({ control, name: 'channels' });
  const channels = useWatch({ control, name: 'channels' });
  const { errors } = useFormState({ control, name: 'channels' });
  const test = useTestNotification();
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const sendTest = async (key: string, type: ChannelType, target: string) => {
    if (validateTarget(type, target)) return;
    setTests((current) => ({ ...current, [key]: { status: 'pending' } }));
    try {
      const result = await test.mutateAsync({ channel: type, target: target.trim(), locale });
      setTests((current) => ({ ...current, [key]: { status: 'done', result } }));
    } catch (error) {
      setTests((current) => ({
        ...current,
        [key]: { status: 'error', message: problemMessage(t, error) },
      }));
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {fields.map((field, index) => {
          const channel = channels?.[index] ?? field;
          const error = errors.channels?.[index]?.target?.message;
          const targetId = `channel-${field.id}-target`;
          const typeId = `channel-${field.id}-type`;
          const problem = validateTarget(channel.type, channel.target);
          return (
            <li key={field.id} className="rounded-lg border bg-background/40 p-3">
              <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <label htmlFor={typeId} className="sr-only">
                    {t('channels.type', { index: index + 1 })}
                  </label>
                  <Controller
                    control={control}
                    name={`channels.${index}.type`}
                    render={({ field: typeField }) => (
                      <Select value={typeField.value} onValueChange={typeField.onChange}>
                        <SelectTrigger id={typeId} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNEL_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              <ChannelIcon type={type} /> {t(`channels.types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <label htmlFor={targetId} className="sr-only">
                    {t('channels.target', { index: index + 1 })}
                  </label>
                  <Controller
                    control={control}
                    name={`channels.${index}.target`}
                    render={({ field: targetField }) => (
                      <Input
                        {...targetField}
                        id={targetId}
                        maxLength={MAX_TARGET_LENGTH}
                        placeholder={t(`channels.placeholders.${channel.type}`)}
                        inputMode={
                          channel.type === 'email'
                            ? 'email'
                            : channel.type === 'webhook'
                              ? 'url'
                              : 'text'
                        }
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={`${targetId}-hint`}
                        className="font-mono text-sm"
                      />
                    )}
                  />
                  <p
                    id={`${targetId}-hint`}
                    className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}
                  >
                    {error ?? t(`channels.hints.${channel.type}`)}
                  </p>
                  {isInsecureWebhook(channel) && (
                    <p className="text-xs text-warning">{t('channels.insecureWebhook')}</p>
                  )}
                  <TestResult state={tests[field.id]} />
                </div>
                <div className="flex gap-1 sm:pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={problem !== null || tests[field.id]?.status === 'pending'}
                    onClick={() => void sendTest(field.id, channel.type, channel.target)}
                  >
                    <Send /> {t('channels.test.action')}
                    <span className="sr-only">: {channel.target}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                    aria-label={t('channels.remove', { index: index + 1 })}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {typeof errors.channels?.message === 'string' && (
        <p className="text-sm text-danger">{errors.channels.message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {CHANNEL_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            variant="subtle"
            size="sm"
            disabled={fields.length >= MAX_CHANNELS}
            onClick={() => append({ type, target: '' })}
          >
            <Plus /> {t(`channels.add.${type}`)}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {t('channels.count', { count: fields.length, max: MAX_CHANNELS })}
        </span>
      </div>
    </div>
  );
}
