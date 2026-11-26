import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type { MeDto } from '@/shared/api/generated/auth/model';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import { useUpdateName } from '../api/profile-api';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';
import { CopyButton } from '@/shared/ui/copy-button';

const NAME_MAX = 200;

function NameForm({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useTranslation('profile');
  const update = useUpdateName();
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('account.nameRequired'))
      .max(NAME_MAX, t('account.nameTooLong', { max: NAME_MAX })),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name },
  });

  const submit = form.handleSubmit(async ({ name: next }) => {
    try {
      await update.mutateAsync(next);
      toast.success(t('account.saved'));
      onDone();
    } catch (error) {
      if (!applyFieldErrors(t, error, form.setError, ['name'])) {
        toast.error(t('account.saveFailed'), { description: problemMessage(t, error) });
      }
    }
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{t('account.name')}</FormLabel>
              <FormControl>
                <Input autoComplete="name" maxLength={NAME_MAX} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 sm:pt-[1.375rem]">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? <Spinner /> : <Check />} {t('common:actions.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={update.isPending}>
            <X /> {t('common:actions.cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Account details (name editable; e-mail, id, status and dates read-only). */
export function AccountCard({ me }: { me: MeDto }) {
  const { t, i18n } = useTranslation('profile');
  const [editing, setEditing] = useState(false);

  return (
    <Section
      title={t('account.title')}
      description={t('account.description')}
      actions={
        !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> {t('account.editName')}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {editing && <NameForm name={me.name} onDone={() => setEditing(false)} />}
        <KeyValueList
          columns={2}
          items={[
            { key: 'name', label: t('account.name'), value: me.name || '—' },
            { key: 'email', label: t('account.email'), value: me.email },
            {
              key: 'id',
              label: t('account.userId'),
              value: (
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="truncate font-mono text-xs">{me.id}</span>
                  <CopyButton value={me.id} label={t('account.copyId')} />
                </span>
              ),
            },
            {
              key: 'status',
              label: t('account.status'),
              value: (
                <Badge variant={me.status === 'active' ? 'success' : 'muted'}>
                  {t(`status.${me.status}`)}
                </Badge>
              ),
            },
            {
              key: 'created',
              label: t('account.createdAt'),
              value: formatDateTime(me.createdAt, i18n.language),
            },
            {
              key: 'updated',
              label: t('account.updatedAt'),
              value: formatDateTime(me.updatedAt, i18n.language),
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">{t('account.emailHint')}</p>
      </div>
    </Section>
  );
}
