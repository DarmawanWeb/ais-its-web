import type { ColumnDef } from '@tanstack/react-table';
import {
  MailPlus,
  MailX,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UserMinus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { InvitationDto, MemberDto } from '@/shared/api/generated/auth/model';
import { useSession } from '@/shared/auth';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  useAllMembers,
  useCancelInvitation,
  useInvitations,
  useInviteMember,
  useMembers,
  useRemoveMember,
} from '../api/auth-admin';
import { OrgContextPicker } from '../components/common';
import { ChangeRoleDialog, InviteMemberDialog } from '../components/member-dialogs';
import { OrgKindBadge, RoleBadge, UserStatusBadge } from '../components/org-bits';
import { useOrgContext } from '../hooks/use-org-context';
import { isLastOrgAdmin } from '../lib/access';
import { problemMessage } from '@/shared/api/problem-copy';

/** Members and invitations of an organization (user:manage, own organization). */
export function MembersPage() {
  const { t, i18n } = useTranslation('admin');
  const session = useSession();
  const context = useOrgContext();
  const orgId = context.orgId;
  const memberPaging = usePageState({ pageSize: 20 });
  const invitationPaging = usePageState({ pageSize: 20 });
  const members = useMembers(orgId, memberPaging.page, memberPaging.pageSize);
  const everyone = useAllMembers(orgId);
  const invitations = useInvitations(orgId, invitationPaging.page, invitationPaging.pageSize);
  const remove = useRemoveMember();
  const cancel = useCancelInvitation();
  const resend = useInviteMember();
  const [inviting, setInviting] = useState(false);
  const [changing, setChanging] = useState<MemberDto | null>(null);
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const [withdrawing, setWithdrawing] = useState<InvitationDto | null>(null);
  const allMembers = useMemo(() => everyone.data?.data ?? [], [everyone.data]);

  const stats = useMemo(() => {
    const total = everyone.data?.meta.total ?? 0;
    const admins = allMembers.filter((m) => m.role === 'org_admin').length;
    const mfa = allMembers.filter((m) => m.mfaEnabled).length;
    return { total, admins, mfaRate: allMembers.length ? (mfa / allMembers.length) * 100 : null };
  }, [allMembers, everyone.data]);
  const pendingInvitations = invitations.data?.meta.total ?? 0;

  const columns = useMemo<ColumnDef<MemberDto>[]>(
    () => [
      {
        id: 'member',
        header: t('members.columns.member'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback>{initials(row.original.name || row.original.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {row.original.name || '—'}
                {row.original.userId === session.userId && (
                  <Badge variant="outline">{t('members.you')}</Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'role',
        header: t('members.columns.role'),
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: 'status',
        header: t('members.columns.status'),
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      },
      {
        id: 'mfa',
        header: t('members.columns.mfa'),
        cell: ({ row }) =>
          row.original.mfaEnabled ? (
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="size-4" aria-hidden /> {t('common.on')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ShieldOff className="size-4" aria-hidden /> {t('common.off')}
            </span>
          ),
      },
      {
        id: 'lastLogin',
        header: t('members.columns.lastLogin'),
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <span title={formatDateTime(row.original.lastLoginAt, i18n.language)}>
              {formatRelativeTime(row.original.lastLoginAt, i18n.language)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('common.never')}</span>
          ),
      },
      {
        id: 'joined',
        header: t('members.columns.joined'),
        cell: ({ row }) => formatDateTime(row.original.joinedAt, i18n.language, 'dd MMM yyyy'),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        meta: { className: 'text-right', alwaysVisible: true },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('members.actions', { name: row.original.name || row.original.email })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setChanging(row.original)}>
                <UserCog /> {t('members.changeRole')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger focus:bg-danger/10 focus:text-danger"
                disabled={isLastOrgAdmin(row.original, allMembers)}
                onSelect={() => setRemoving(row.original)}
              >
                <UserMinus className="text-danger" /> {t('members.remove')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t, i18n.language, session.userId, allMembers],
  );

  const invitationColumns = useMemo<ColumnDef<InvitationDto>[]>(
    () => [
      {
        id: 'invitee',
        header: t('members.invitations.columns.invitee'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: 'role',
        header: t('members.columns.role'),
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: 'state',
        header: t('members.invitations.columns.state'),
        cell: ({ row }) =>
          row.original.expired ? (
            <Badge variant="warning">{t('members.invitations.expired')}</Badge>
          ) : (
            <Badge variant="info">{t('members.invitations.pending')}</Badge>
          ),
      },
      {
        id: 'sent',
        header: t('members.invitations.columns.sent'),
        cell: ({ row }) => formatRelativeTime(row.original.createdAt, i18n.language),
      },
      {
        id: 'expires',
        header: t('members.invitations.columns.expires'),
        cell: ({ row }) => formatDateTime(row.original.expiresAt, i18n.language),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        meta: { className: 'text-right', alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={resend.isPending}
              onClick={() => {
                if (!orgId) return;
                resend.mutate(
                  {
                    orgId,
                    body: {
                      email: row.original.email,
                      name: row.original.name,
                      role: row.original.role,
                    },
                  },
                  {
                    onSuccess: () =>
                      toast.success(t('members.toasts.resent', { email: row.original.email })),
                    onError: (error) =>
                      toast.error(t('members.toasts.inviteFailed'), {
                        description: problemMessage(t, error),
                      }),
                  },
                );
              }}
            >
              <RefreshCw /> {t('members.invitations.resend')}
              <span className="sr-only">: {row.original.email}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setWithdrawing(row.original)}
            >
              <MailX /> {t('members.invitations.withdraw')}
              <span className="sr-only">: {row.original.email}</span>
            </Button>
          </div>
        ),
      },
    ],
    [t, i18n.language, orgId, resend],
  );

  const confirmRemove = async () => {
    if (!removing || !orgId) return;
    try {
      await remove.mutateAsync({ orgId, userId: removing.userId });
      toast.success(t('members.toasts.removed', { name: removing.name || removing.email }));
    } catch (error) {
      toast.error(t('members.toasts.removeFailed'), { description: problemMessage(t, error) });
    } finally {
      setRemoving(null);
    }
  };

  const confirmWithdraw = async () => {
    if (!withdrawing || !orgId) return;
    try {
      await cancel.mutateAsync({ orgId, invitationId: withdrawing.id });
      toast.success(t('members.toasts.withdrawn', { email: withdrawing.email }));
    } catch (error) {
      toast.error(t('members.toasts.withdrawFailed'), { description: problemMessage(t, error) });
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('members.title')}
        description={t('members.description')}
        icon={Users}
        actions={
          <>
            <OrgContextPicker context={context} />
            <Button onClick={() => setInviting(true)} disabled={!orgId}>
              <MailPlus /> {t('members.inviteAction')}
            </Button>
          </>
        }
      >
        {context.orgKind && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <OrgKindBadge kind={context.orgKind} />
            {context.orgKind === 'authority'
              ? t('members.authorityOrg')
              : t('members.nonAuthorityOrg')}
          </div>
        )}
      </PageHeader>

      {!orgId ? (
        <div className="rounded-xl border border-dashed bg-surface/50">
          <EmptyState
            icon={Users}
            title={t('common.noOrganization')}
            description={t('members.noOrgHint')}
          />
        </div>
      ) : (
        <>
          <section
            aria-label={t('members.statsLabel')}
            className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
          >
            <StatCard
              label={t('members.stats.members')}
              value={formatNumber(stats.total, i18n.language)}
              icon={Users}
              tone="primary"
              loading={everyone.isPending}
            />
            <StatCard
              label={t('members.stats.admins')}
              value={formatNumber(stats.admins, i18n.language)}
              description={t('members.stats.adminsHint')}
              icon={UserCog}
              loading={everyone.isPending}
            />
            <StatCard
              label={t('members.stats.mfa')}
              value={
                stats.mfaRate === null
                  ? '—'
                  : formatNumber(stats.mfaRate, i18n.language, { maximumFractionDigits: 0 })
              }
              unit={stats.mfaRate === null ? undefined : '%'}
              description={t('members.stats.mfaHint')}
              icon={ShieldCheck}
              tone={stats.mfaRate !== null && stats.mfaRate < 100 ? 'warning' : 'success'}
              loading={everyone.isPending}
            />
            <StatCard
              label={t('members.stats.invitations')}
              value={formatNumber(pendingInvitations, i18n.language)}
              description={t('members.stats.invitationsHint')}
              icon={MailPlus}
              loading={invitations.isPending}
            />
          </section>

          <Tabs defaultValue="members" className="gap-4">
            <TabsList>
              <TabsTrigger value="members">
                {t('members.tabs.members')} <Badge variant="muted">{stats.total}</Badge>
              </TabsTrigger>
              <TabsTrigger value="invitations">
                {t('members.tabs.invitations')} <Badge variant="muted">{pendingInvitations}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="members">
              <h2 className="sr-only">{t('members.tabs.members')}</h2>
              <DataTable
                ariaLabel={t('members.tableLabel')}
                columns={columns}
                data={members.data?.data}
                loading={members.isPending}
                error={members.error}
                onRetry={() => void members.refetch()}
                getRowId={(member) => member.userId}
                pagination={memberPaging.adapter(members.data?.meta)}
                emptyState={
                  <EmptyState
                    size="sm"
                    icon={Users}
                    title={t('members.empty')}
                    description={t('members.emptyHint')}
                    action={
                      <Button size="sm" onClick={() => setInviting(true)}>
                        <MailPlus /> {t('members.inviteAction')}
                      </Button>
                    }
                  />
                }
              />
            </TabsContent>
            <TabsContent value="invitations">
              <h2 className="sr-only">{t('members.tabs.invitations')}</h2>
              <DataTable
                ariaLabel={t('members.invitations.tableLabel')}
                columns={invitationColumns}
                data={invitations.data?.data}
                loading={invitations.isPending}
                error={invitations.error}
                onRetry={() => void invitations.refetch()}
                getRowId={(invitation) => invitation.id}
                pagination={invitationPaging.adapter(invitations.data?.meta)}
                emptyState={
                  <EmptyState
                    size="sm"
                    icon={MailPlus}
                    title={t('members.invitations.empty')}
                    description={t('members.invitations.emptyHint')}
                  />
                }
              />
            </TabsContent>
          </Tabs>
          <InviteMemberDialog
            open={inviting}
            onOpenChange={setInviting}
            orgId={orgId}
            orgName={context.orgName}
            orgKind={context.orgKind}
          />
          <ChangeRoleDialog
            member={changing}
            onOpenChange={(open) => !open && setChanging(null)}
            orgId={orgId}
            orgKind={context.orgKind}
            lastAdmin={changing ? isLastOrgAdmin(changing, allMembers) : false}
          />
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('members.removeConfirm.title', { name: removing?.name || removing?.email || '' })}
        description={
          removing?.userId === session.userId
            ? t('members.removeConfirm.self')
            : t('members.removeConfirm.description')
        }
        confirmLabel={t('members.remove')}
        destructive
        onConfirm={confirmRemove}
      />
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        title={t('members.withdrawConfirm.title', { email: withdrawing?.email ?? '' })}
        description={t('members.withdrawConfirm.description')}
        confirmLabel={t('members.invitations.withdraw')}
        destructive
        onConfirm={confirmWithdraw}
      />
    </div>
  );
}
