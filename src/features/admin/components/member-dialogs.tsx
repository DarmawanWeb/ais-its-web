import { ROLE_LABELS } from '@darmawanweb/ais-its-contracts/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailPlus, Save, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type { MemberDto } from '@/shared/api/generated/auth/model';
import { toApiProblem } from '@/shared/api/problem';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
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
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import { useInviteMember, useUpdateMemberRole } from '../api/auth-admin';
import { useAppLanguage } from '@/shared/i18n';
import { grantableRoles, type OrgRole } from '../lib/access';
import { applyFieldErrors, problemMessage } from '@/shared/api/problem-copy';

function RoleOptions({
  value,
  onChange,
  roles,
  disabledRoles = [],
  idPrefix,
}: {
  value: string;
  onChange: (value: OrgRole) => void;
  roles: readonly OrgRole[];
  disabledRoles?: readonly OrgRole[];
  idPrefix: string;
}) {
  const { t } = useTranslation('admin');
  const locale = useAppLanguage();
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as OrgRole)}
      className="grid gap-2"
    >
      {roles.map((role) => {
        const disabled = disabledRoles.includes(role);
        return (
          <Label
            key={role}
            htmlFor={`${idPrefix}-${role}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border bg-background/40 p-3 font-normal hover:bg-accent/40',
              value === role && 'border-primary/60 bg-primary/8',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <RadioGroupItem
              id={`${idPrefix}-${role}`}
              value={role}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{ROLE_LABELS[role][locale]}</span>
              <span className="block text-xs text-muted-foreground">
                {t(`roles.hints.${role}`)}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

/** Invites an e-mail address with a role (POST /organizations/:id/members). */
export function InviteMemberDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  orgKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string | null;
  orgKind: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <InviteForm
          orgId={orgId}
          orgName={orgName}
          orgKind={orgKind}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function InviteForm({
  orgId,
  orgName,
  orgKind,
  onDone,
}: {
  orgId: string;
  orgName: string | null;
  orgKind: string | null;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation('admin');
  const invite = useInviteMember();
  const roles = grantableRoles(orgKind);
  const schema = z.object({
    email: z.email(t('members.invite.emailInvalid')).max(320),
    name: z
      .string()
      .trim()
      .min(1, t('members.invite.nameRequired'))
      .max(200, t('common.tooLong', { max: 200 })),
    role: z.enum(['org_admin', 'fleet_manager', 'authority', 'viewer']),
    locale: z.enum(['id', 'en']),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      name: '',
      role: orgKind === 'authority' ? 'authority' : 'fleet_manager',
      locale: i18n.language === 'en' ? 'en' : 'id',
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const sent = await invite.mutateAsync({
        orgId,
        body: {
          email: values.email.trim(),
          name: values.name.trim(),
          role: values.role,
          locale: values.locale,
        },
      });
      if (sent.invitationSent) toast.success(t('members.toasts.invited', { email: sent.email }));
      else toast.warning(t('members.toasts.invitedNoMail', { email: sent.email }));
      onDone();
    } catch (error) {
      const problem = toApiProblem(error);
      if (problem.code === 'MEMBER_ALREADY_EXISTS') {
        form.setError('email', { type: 'server', message: t('problems.MEMBER_ALREADY_EXISTS') });
      } else if (problem.code === 'ROLE_NOT_GRANTABLE') {
        form.setError('role', { type: 'server', message: t('problems.ROLE_NOT_GRANTABLE') });
      } else if (!applyFieldErrors(t, error, form.setError, ['email', 'name', 'role'])) {
        toast.error(t('members.toasts.inviteFailed'), { description: problemMessage(t, error) });
      }
    }
  });

  return (
    <DialogContent className="sm:max-w-lg" closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle>{t('members.invite.title')}</DialogTitle>
        <DialogDescription>
          {t('members.invite.description', { org: orgName ?? '—' })}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          id="invite-form"
          onSubmit={(event) => void submit(event)}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('members.invite.email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="off"
                      placeholder="nama@perusahaan.co.id"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('members.invite.name')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('members.invite.role')}</FormLabel>
                <RoleOptions
                  value={field.value}
                  onChange={field.onChange}
                  roles={roles}
                  idPrefix="invite-role"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {orgKind !== 'authority' && (
            <p className="text-xs text-muted-foreground">{t('members.invite.authorityHint')}</p>
          )}
          <FormField
            control={form.control}
            name="locale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('members.invite.locale')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="id">{t('common:shell.language.id')}</SelectItem>
                    <SelectItem value="en">{t('common:shell.language.en')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <Alert variant="info">
            <AlertDescription>{t('members.invite.consent')}</AlertDescription>
          </Alert>
        </form>
      </Form>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={invite.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form="invite-form" disabled={invite.isPending}>
          {invite.isPending ? <Spinner /> : <MailPlus />} {t('members.invite.submit')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Changes a member's role (PATCH …/members/:userId); the last org admin cannot be demoted. */
export function ChangeRoleDialog({
  member,
  onOpenChange,
  orgId,
  orgKind,
  lastAdmin,
}: {
  member: MemberDto | null;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgKind: string | null;
  lastAdmin: boolean;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      {member && (
        <ChangeRoleContent
          key={member.userId}
          member={member}
          orgId={orgId}
          orgKind={orgKind}
          lastAdmin={lastAdmin}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function ChangeRoleContent({
  member,
  orgId,
  orgKind,
  lastAdmin,
  onDone,
}: {
  member: MemberDto;
  orgId: string;
  orgKind: string | null;
  lastAdmin: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('admin');
  const update = useUpdateMemberRole();
  const [role, setRole] = useState<OrgRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const roles = grantableRoles(orgKind);
  const disabledRoles = lastAdmin ? roles.filter((r) => r !== 'org_admin') : [];

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({ orgId, userId: member.userId, role });
      toast.success(t('members.toasts.roleChanged', { name: member.name || member.email }));
      onDone();
    } catch (failure) {
      setError(problemMessage(t, failure));
    }
  };

  return (
    <DialogContent closeLabel={t('common:actions.close')}>
      <DialogHeader>
        <DialogTitle>{t('members.role.title')}</DialogTitle>
        <DialogDescription>
          {t('members.role.description', { name: member.name || member.email })}
        </DialogDescription>
      </DialogHeader>
      <RoleOptions
        value={role}
        onChange={setRole}
        roles={roles}
        disabledRoles={disabledRoles}
        idPrefix="member-role"
      />
      {lastAdmin && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertDescription>{t('members.role.lastAdmin')}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          {t('common:actions.cancel')}
        </Button>
        <Button onClick={() => void save()} disabled={update.isPending || role === member.role}>
          {update.isPending ? <Spinner /> : <Save />} {t('members.role.submit')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
