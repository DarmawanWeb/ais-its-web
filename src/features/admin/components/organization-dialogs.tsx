import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type { OrganizationDto } from '@/shared/api/generated/auth/model';
import { toApiProblem } from '@/shared/api/problem';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import {
  useCreateOrganization,
  useDeleteOrganization,
  useUpdateOrganization,
} from '../api/auth-admin';
import { slugify, SLUG_PATTERN } from '../lib/access';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';
import { KIND_ICONS } from '../lib/org-kinds';

const KINDS = ['shipping_company', 'authority', 'research'] as const;

/** Create or edit an organization (name, slug, kind); the platform organization keeps its kind. */
export function OrganizationFormDialog({
  open,
  onOpenChange,
  organization,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: OrganizationDto;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <OrganizationForm
          key={organization?.id ?? 'new'}
          organization={organization}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function OrganizationForm({
  organization,
  onDone,
}: {
  organization?: OrganizationDto;
  onDone: () => void;
}) {
  const { t } = useTranslation('admin');
  const create = useCreateOrganization();
  const update = useUpdateOrganization();
  const [conflict, setConflict] = useState<string | null>(null);
  const platform = organization?.kind === 'platform';

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('organizations.form.nameRequired'))
      .max(200, t('common.tooLong', { max: 200 })),
    slug: z
      .string()
      .trim()
      .max(63, t('common.tooLong', { max: 63 }))
      .refine(
        (value) => value === '' || SLUG_PATTERN.test(value),
        t('organizations.form.slugInvalid'),
      ),
    kind: z.string(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization?.name ?? '',
      slug: organization?.slug ?? '',
      kind: organization?.kind ?? 'shipping_company',
    },
  });
  const name = useWatch({ control: form.control, name: 'name' });
  const slug = useWatch({ control: form.control, name: 'slug' });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const pending = create.isPending || update.isPending;
  const kindChanged = organization !== undefined && kind !== organization.kind;

  const submit = form.handleSubmit(async (values) => {
    setConflict(null);
    try {
      if (organization) {
        const body = {
          ...(values.name.trim() !== organization.name ? { name: values.name.trim() } : {}),
          ...(values.slug && values.slug !== organization.slug ? { slug: values.slug } : {}),
          ...(!platform && values.kind !== organization.kind
            ? { kind: values.kind as (typeof KINDS)[number] }
            : {}),
        };
        await update.mutateAsync({ id: organization.id, body });
        toast.success(t('organizations.toasts.updated', { name: values.name.trim() }));
      } else {
        await create.mutateAsync({
          name: values.name.trim(),
          kind: values.kind as (typeof KINDS)[number],
          ...(values.slug ? { slug: values.slug } : {}),
        });
        toast.success(t('organizations.toasts.created', { name: values.name.trim() }));
      }
      onDone();
    } catch (error) {
      const problem = toApiProblem(error);
      if (problem.code === 'ORGANIZATION_SLUG_TAKEN') {
        form.setError('slug', { type: 'server', message: t('problems.ORGANIZATION_SLUG_TAKEN') });
      } else if (
        problem.code === 'ORGANIZATION_KIND_CONFLICT' ||
        problem.code === 'ORGANIZATION_PROTECTED'
      ) {
        setConflict(problemMessage(t, problem) + (problem.detail ? ` (${problem.detail})` : ''));
      } else if (!applyFieldErrors(t, error, form.setError, ['name', 'slug', 'kind'])) {
        toast.error(t('organizations.toasts.saveFailed'), {
          description: problemMessage(t, error),
        });
      }
    }
  });

  return (
    <DialogContent className="sm:max-w-xl" closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle>
          {organization ? t('organizations.form.editTitle') : t('organizations.form.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('organizations.form.description')}</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          id="organization-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('organizations.form.name')}</FormLabel>
                <FormControl>
                  <Input
                    maxLength={200}
                    placeholder={t('organizations.form.namePlaceholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('organizations.form.slug')}</FormLabel>
                <FormControl>
                  <Input
                    maxLength={63}
                    className="font-mono"
                    placeholder={slugify(name) || 'pelayaran-nusantara'}
                    spellCheck={false}
                    {...field}
                    onChange={(event) => field.onChange(event.target.value.toLowerCase())}
                  />
                </FormControl>
                <FormDescription>
                  {slug
                    ? t('organizations.form.slugHint')
                    : t('organizations.form.slugAuto', { slug: slugify(name) || '—' })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('organizations.form.kind')}</FormLabel>
                {platform ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {t('organizations.form.platformKind')}
                  </p>
                ) : (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-2"
                  >
                    {KINDS.map((value) => {
                      const Icon = KIND_ICONS[value]!;
                      return (
                        <Label
                          key={value}
                          htmlFor={`kind-${value}`}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border bg-background/40 p-3 font-normal hover:bg-accent/40',
                            field.value === value && 'border-primary/60 bg-primary/8',
                          )}
                        >
                          <RadioGroupItem id={`kind-${value}`} value={value} className="mt-0.5" />
                          <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium">
                              {t(`orgKinds.${value}`)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t(`organizations.form.kindHints.${value}`)}
                            </span>
                          </span>
                        </Label>
                      );
                    })}
                  </RadioGroup>
                )}
              </FormItem>
            )}
          />
          {kindChanged && organization?.kind === 'authority' && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              <AlertDescription>{t('organizations.form.kindWarning')}</AlertDescription>
            </Alert>
          )}
          {conflict && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert aria-hidden />
              <AlertTitle>{t('organizations.form.conflictTitle')}</AlertTitle>
              <AlertDescription>{conflict}</AlertDescription>
            </Alert>
          )}
        </form>
      </Form>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form="organization-form" disabled={pending}>
          {pending ? <Spinner /> : <Save />}
          {organization ? t('common:actions.save') : t('organizations.form.create')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Deletes an organization after typing its slug (memberships and API keys go with it). */
export function DeleteOrganizationDialog({
  organization,
  onOpenChange,
}: {
  organization: OrganizationDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const remove = useDeleteOrganization();
  const [typed, setTyped] = useState('');
  const close = (open: boolean) => {
    if (remove.isPending) return;
    if (!open) setTyped('');
    onOpenChange(open);
  };
  const confirm = async () => {
    if (!organization) return;
    try {
      await remove.mutateAsync(organization.id);
      toast.success(t('organizations.toasts.deleted', { name: organization.name }));
      close(false);
    } catch (error) {
      toast.error(t('organizations.toasts.deleteFailed'), {
        description: problemMessage(t, error),
      });
    }
  };
  return (
    <Dialog open={organization !== null} onOpenChange={close}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {t('organizations.delete.title', { name: organization?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('organizations.delete.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-org-confirm">
            {t('organizations.delete.typeSlug', { slug: organization?.slug ?? '' })}
          </Label>
          <Input
            id="delete-org-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={remove.isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            disabled={!organization || typed.trim() !== organization.slug || remove.isPending}
          >
            {remove.isPending ? <Spinner /> : <Trash2 />} {t('organizations.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
