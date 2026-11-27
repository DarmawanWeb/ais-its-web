import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  FlaskConical,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  Ship,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type {
  OrganizationDto,
  OrganizationListItemDto,
  OrganizationsControllerListKind,
} from '@/shared/api/generated/auth/model';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { useAllOrganizations, useOrganizationList, useOrganizationStats } from '../api/auth-admin';
import { SearchInput } from '../components/common';
import {
  DeleteOrganizationDialog,
  OrganizationFormDialog,
} from '../components/organization-dialogs';
import { OrgKindBadge } from '../components/org-bits';
import { UsersDirectory } from '../components/users-directory';
import { ORG_KINDS } from '../lib/access';

const ALL = 'all';

/** Organizations (tenants) of the platform and the user directory (org:manage). */
export function OrganizationsPage() {
  const { t, i18n } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>(ALL);
  const term = useDebouncedValue(search.trim(), 300);
  const paging = usePageState({ pageSize: 20 });
  const organizations = useOrganizationList({
    page: paging.page,
    pageSize: paging.pageSize,
    search: term,
    kind: kind === ALL ? undefined : (kind as OrganizationsControllerListKind),
  });
  const all = useAllOrganizations(true);
  const [form, setForm] = useState<{ organization?: OrganizationDto } | null>(null);
  const [deleting, setDeleting] = useState<OrganizationDto | null>(null);

  // Counts over every page (`GET /organizations/stats`), not only the first 100 rows.
  const stats = useOrganizationStats('');
  const counts = {
    total: stats.data?.total ?? 0,
    shipping: stats.data?.byKind.shipping_company ?? 0,
    authority: stats.data?.byKind.authority ?? 0,
    research: stats.data?.byKind.research ?? 0,
  };
  const orgNames = useMemo(
    () => new Map((all.data?.data ?? []).map((org) => [org.id, org.name])),
    [all.data],
  );

  const columns = useMemo<ColumnDef<OrganizationDto>[]>(
    () => [
      {
        id: 'name',
        header: t('organizations.columns.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-8 rounded-md">
              <AvatarFallback className="rounded-md">{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {row.original.slug}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('organizations.columns.kind'),
        cell: ({ row }) => <OrgKindBadge kind={row.original.kind} />,
      },
      {
        id: 'members',
        header: t('organizations.columns.members'),
        meta: { className: 'text-right' },
        cell: ({ row }) => {
          const item = row.original as Partial<OrganizationListItemDto>;
          return (
            <div className="text-right whitespace-nowrap">
              <p className="font-mono tabular-nums">
                {formatNumber(item.memberCount ?? null, i18n.language)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('organizations.apiKeys', { count: item.apiKeyCount ?? 0 })}
              </p>
            </div>
          );
        },
      },
      {
        id: 'created',
        header: t('organizations.columns.created'),
        cell: ({ row }) => formatDateTime(row.original.createdAt, i18n.language, 'dd MMM yyyy'),
      },
      {
        id: 'updated',
        header: t('organizations.columns.updated'),
        cell: ({ row }) => formatDateTime(row.original.updatedAt, i18n.language),
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
                aria-label={t('organizations.actions', { name: row.original.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setForm({ organization: row.original })}>
                <Pencil /> {t('common:actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/admin/members?org=${row.original.id}`}>
                  <Users /> {t('organizations.viewMembers')}
                </Link>
              </DropdownMenuItem>
              {row.original.kind !== 'platform' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:bg-danger/10 focus:text-danger"
                    onSelect={() => setDeleting(row.original)}
                  >
                    <Trash2 className="text-danger" /> {t('common:actions.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t, i18n.language],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('organizations.title')}
        description={t('organizations.description')}
        icon={Building2}
        actions={
          <Button onClick={() => setForm({})}>
            <Plus /> {t('organizations.create')}
          </Button>
        }
      />
      <section
        aria-label={t('organizations.statsLabel')}
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <StatCard
          label={t('organizations.stats.total')}
          value={formatNumber(counts.total, i18n.language)}
          icon={Building2}
          tone="primary"
          loading={stats.isPending}
        />
        <StatCard
          label={t('orgKinds.shipping_company')}
          value={formatNumber(counts.shipping, i18n.language)}
          icon={Ship}
          loading={stats.isPending}
        />
        <StatCard
          label={t('orgKinds.authority')}
          value={formatNumber(counts.authority, i18n.language)}
          icon={Landmark}
          loading={stats.isPending}
        />
        <StatCard
          label={t('orgKinds.research')}
          value={formatNumber(counts.research, i18n.language)}
          icon={FlaskConical}
          loading={stats.isPending}
        />
      </section>
      <Tabs defaultValue="organizations" className="gap-4">
        <TabsList>
          <TabsTrigger value="organizations">{t('organizations.tabs.organizations')}</TabsTrigger>
          <TabsTrigger value="users">{t('organizations.tabs.users')}</TabsTrigger>
        </TabsList>
        <TabsContent value="organizations">
          <h2 className="sr-only">{t('organizations.tabs.organizations')}</h2>
          <DataTable
            ariaLabel={t('organizations.tableLabel')}
            columns={columns}
            data={organizations.data?.data}
            loading={organizations.isPending}
            error={organizations.error}
            onRetry={() => void organizations.refetch()}
            getRowId={(org) => org.id}
            pagination={paging.adapter(organizations.data?.meta)}
            toolbar={
              <>
                <SearchInput
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    paging.setPage(1);
                  }}
                  label={t('organizations.search')}
                  placeholder={t('organizations.searchPlaceholder')}
                />
                <Select
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value);
                    paging.setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-full sm:w-52"
                    aria-label={t('organizations.kindFilter')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('organizations.allKinds')}</SelectItem>
                    {ORG_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`orgKinds.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            emptyState={
              term || kind !== ALL ? (
                <EmptyState
                  size="sm"
                  title={t('organizations.noMatches')}
                  description={t('organizations.noMatchesHint')}
                />
              ) : (
                <EmptyState
                  size="sm"
                  icon={Building2}
                  title={t('organizations.empty')}
                  description={t('organizations.emptyHint')}
                  action={
                    <Button size="sm" onClick={() => setForm({})}>
                      <Plus /> {t('organizations.create')}
                    </Button>
                  }
                />
              )
            }
          />
        </TabsContent>
        <TabsContent value="users">
          <h2 className="sr-only">{t('organizations.tabs.users')}</h2>
          <UsersDirectory orgNames={orgNames} />
        </TabsContent>
      </Tabs>
      <OrganizationFormDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        organization={form?.organization}
      />
      <DeleteOrganizationDialog
        organization={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  );
}
