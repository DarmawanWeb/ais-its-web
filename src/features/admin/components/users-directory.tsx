import type { ColumnDef } from '@tanstack/react-table';
import { ShieldCheck, ShieldOff, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  DirectoryUserDto,
  UsersControllerListStatus,
} from '@/shared/api/generated/auth/model';
import { useSession } from '@/shared/auth';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

import { useSetUserStatus, useUserDirectory } from '../api/auth-admin';
import { problemMessage } from '@/shared/api/problem-copy';
import { SearchInput } from './common';
import { RoleBadge, UserStatusBadge } from './org-bits';

const ALL = 'all';

/** Platform user directory (GET /users, org:manage) with enabling / disabling accounts. */
export function UsersDirectory({ orgNames }: { orgNames: ReadonlyMap<string, string> }) {
  const { t, i18n } = useTranslation('admin');
  const session = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const term = useDebouncedValue(search.trim(), 300);
  const paging = usePageState({ pageSize: 20 });
  const users = useUserDirectory({
    page: paging.page,
    pageSize: paging.pageSize,
    search: term,
    status: status === ALL ? undefined : (status as UsersControllerListStatus),
    enabled: true,
  });
  const setUserStatus = useSetUserStatus();
  const [pending, setPending] = useState<DirectoryUserDto | null>(null);

  const columns = useMemo<ColumnDef<DirectoryUserDto>[]>(
    () => [
      {
        id: 'user',
        header: t('users.columns.user'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback>{initials(row.original.name || row.original.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {row.original.name || '—'}
                {row.original.isPlatformAdmin && (
                  <Badge variant="info">{t('users.superAdmin')}</Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'memberships',
        header: t('users.columns.memberships'),
        cell: ({ row }) =>
          row.original.memberships.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex max-w-80 flex-wrap gap-1">
              {row.original.memberships.map((membership) => (
                <span key={membership.orgId} className="inline-flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">
                    {orgNames.get(membership.orgId) ?? membership.orgId.slice(0, 8)}
                  </span>
                  <RoleBadge role={membership.role} />
                </span>
              ))}
            </span>
          ),
      },
      {
        id: 'status',
        header: t('users.columns.status'),
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      },
      {
        id: 'mfa',
        header: t('users.columns.mfa'),
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
        header: t('users.columns.lastLogin'),
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
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        meta: { className: 'text-right', alwaysVisible: true },
        cell: ({ row }) => {
          const user = row.original;
          if (user.id === session.userId || user.status === 'invited') return null;
          const disabled = user.status === 'disabled';
          return (
            <Button
              variant="ghost"
              size="sm"
              className={disabled ? undefined : 'text-danger hover:bg-danger/10 hover:text-danger'}
              onClick={() => setPending(user)}
            >
              {disabled ? <UserRoundCheck /> : <UserRoundX />}
              {disabled ? t('users.enable') : t('users.disable')}
              <span className="sr-only">: {user.email}</span>
            </Button>
          );
        },
      },
    ],
    [t, i18n.language, orgNames, session.userId],
  );

  const confirm = async () => {
    if (!pending) return;
    const next = pending.status === 'disabled' ? 'active' : 'disabled';
    try {
      await setUserStatus.mutateAsync({ id: pending.id, status: next });
      toast.success(
        t(next === 'disabled' ? 'users.toasts.disabled' : 'users.toasts.enabled', {
          email: pending.email,
        }),
      );
    } catch (error) {
      toast.error(t('users.toasts.failed'), { description: problemMessage(t, error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <DataTable
        ariaLabel={t('users.tableLabel')}
        columns={columns}
        data={users.data?.data}
        loading={users.isPending}
        error={users.error}
        onRetry={() => void users.refetch()}
        getRowId={(user) => user.id}
        pagination={paging.adapter(users.data?.meta)}
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                paging.setPage(1);
              }}
              label={t('users.search')}
              placeholder={t('users.searchPlaceholder')}
            />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                paging.setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label={t('users.statusFilter')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('users.allStatuses')}</SelectItem>
                {(['active', 'invited', 'disabled'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`userStatus.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        emptyState={
          <EmptyState
            size="sm"
            icon={Users}
            title={t('users.empty')}
            description={t('users.emptyHint')}
          />
        }
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.status === 'disabled'
            ? t('users.confirmEnable', { email: pending.email })
            : t('users.confirmDisable', { email: pending?.email ?? '' })
        }
        description={
          pending?.status === 'disabled'
            ? t('users.confirmEnableText')
            : t('users.confirmDisableText')
        }
        confirmLabel={pending?.status === 'disabled' ? t('users.enable') : t('users.disable')}
        destructive={pending?.status !== 'disabled'}
        onConfirm={confirm}
      />
    </>
  );
}
