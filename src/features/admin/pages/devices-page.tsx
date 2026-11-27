import type { ColumnDef } from '@tanstack/react-table';
import {
  Cable,
  Cpu,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Radio,
  Trash2,
  Webhook,
  Wifi,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  DeviceDto,
  DevicesControllerListKind,
  DevicesControllerListStatus,
} from '@/shared/api/generated/telemetry/model';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

import { useApiKeys } from '../api/auth-admin';
import { useDeviceMutations, useDevices } from '../api/devices';
import { useOrgVessels } from '../api/fleet-admin';
import { OrgContextPicker, SearchInput } from '../components/common';
import { ConnectionSheet, DeviceFormDialog } from '../components/device-dialogs';
import { useOrgContext } from '../hooks/use-org-context';
import { type ConnectionState, connectionState } from '../lib/devices';
import { problemMessage } from '@/shared/api/problem-copy';

const ALL = 'all';
const STATE_STYLE: Record<ConnectionState, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  offline: 'bg-danger',
  never: 'bg-muted-foreground/50',
  inactive: 'bg-muted-foreground/30',
};

/** Telemetry devices of an organization (device:manage): register, bind to a vessel, connect. */
export function DevicesPage() {
  const { t, i18n } = useTranslation('admin');
  const context = useOrgContext({ allowAll: true });
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [vessel, setVessel] = useState<string>(ALL);
  const term = useDebouncedValue(search.trim(), 300);
  const paging = usePageState({ pageSize: 20 });
  const devices = useDevices({
    page: paging.page,
    pageSize: paging.pageSize,
    search: term,
    kind: kind === ALL ? undefined : (kind as DevicesControllerListKind),
    status: status === ALL ? undefined : (status as DevicesControllerListStatus),
    mmsi: vessel === ALL ? undefined : Number(vessel),
    orgId: context.isPlatformAdmin ? (context.orgId ?? undefined) : undefined,
  });
  const overview = useDevices({
    page: 1,
    pageSize: 100,
    orgId: context.isPlatformAdmin ? (context.orgId ?? undefined) : undefined,
  });
  const vessels = useOrgVessels(context.orgId, true);
  const keys = useApiKeys({
    orgId: context.orgId ?? undefined,
    includeRevoked: true,
    page: 1,
    pageSize: 100,
  });
  const { update, remove } = useDeviceMutations();
  const [form, setForm] = useState<{ device?: DeviceDto } | null>(null);
  const [connecting, setConnecting] = useState<DeviceDto | null>(null);
  const [deleting, setDeleting] = useState<DeviceDto | null>(null);

  const vesselNames = useMemo(
    () => new Map((vessels.data?.data ?? []).map((v) => [v.mmsi, v.name])),
    [vessels.data],
  );
  const keyNames = useMemo(
    () => new Map((keys.data?.data ?? []).map((k) => [k.id, k])),
    [keys.data],
  );
  const stats = useMemo(() => {
    const list = overview.data?.data ?? [];
    return {
      total: overview.data?.meta.total ?? 0,
      active: list.filter((d) => d.status === 'active').length,
      online: list.filter((d) => connectionState(d) === 'online').length,
      mqtt: list.filter((d) => d.kind === 'mqtt').length,
      http: list.filter((d) => d.kind === 'http').length,
    };
  }, [overview.data]);

  const toggleStatus = (device: DeviceDto) =>
    update.mutate(
      { id: device.id, body: { status: device.status === 'active' ? 'inactive' : 'active' } },
      {
        onSuccess: (next) =>
          toast.success(
            t(
              next.status === 'active' ? 'devices.toasts.activated' : 'devices.toasts.deactivated',
              { name: next.name },
            ),
          ),
        onError: (error) =>
          toast.error(t('devices.toasts.saveFailed'), { description: problemMessage(t, error) }),
      },
    );

  const columns = useMemo<ColumnDef<DeviceDto>[]>(
    () => [
      {
        id: 'device',
        header: t('devices.columns.device'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => {
          const state = connectionState(row.original);
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn('size-2.5 shrink-0 rounded-full', STATE_STYLE[state])}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{row.original.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {row.original.serialNumber ?? '—'}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'vessel',
        header: t('devices.columns.vessel'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.original.vesselName ?? vesselNames.get(row.original.mmsi) ?? '—'}
            </p>
            <MmsiText mmsi={row.original.mmsi} className="text-xs text-muted-foreground" />
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('devices.columns.kind'),
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.kind === 'mqtt' ? <Radio aria-hidden /> : <Webhook aria-hidden />}
            {t(`devices.kinds.${row.original.kind}`)}
          </Badge>
        ),
      },
      {
        id: 'credential',
        header: t('devices.columns.credential'),
        cell: ({ row }) => {
          if (row.original.kind === 'mqtt') {
            const topic = row.original.mqttTopic ?? '—';
            return (
              <span
                className="block max-w-52 truncate font-mono text-xs text-muted-foreground"
                title={topic}
              >
                {topic}
              </span>
            );
          }
          const key = row.original.apiKeyId ? keyNames.get(row.original.apiKeyId) : undefined;
          return key ? (
            <div className="max-w-56 min-w-0">
              <p className="truncate text-sm" title={key.name}>
                {key.name}
              </p>
              <p className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{key.prefix}</span>
                {key.revokedAt && <Badge variant="danger">{t('devices.keyRevoked')}</Badge>}
              </p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        header: t('devices.columns.status'),
        cell: ({ row }) => {
          const state = connectionState(row.original);
          return (
            <Badge
              variant={
                state === 'online'
                  ? 'success'
                  : state === 'idle'
                    ? 'warning'
                    : state === 'offline'
                      ? 'danger'
                      : 'muted'
              }
            >
              {t(`devices.states.${state}`)}
            </Badge>
          );
        },
      },
      {
        id: 'lastSeen',
        header: t('devices.columns.lastSeen'),
        cell: ({ row }) =>
          row.original.lastSeenAt ? (
            <span title={formatDateTime(row.original.lastSeenAt, i18n.language)}>
              {formatRelativeTime(row.original.lastSeenAt, i18n.language)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('common.never')}</span>
          ),
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
                aria-label={t('devices.actions', { name: row.original.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setConnecting(row.original)}>
                <Cable /> {t('devices.connect')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setForm({ device: row.original })}>
                <Pencil /> {t('common:actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleStatus(row.original)}>
                <Power />{' '}
                {row.original.status === 'active' ? t('devices.deactivate') : t('devices.activate')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger focus:bg-danger/10 focus:text-danger"
                onSelect={() => setDeleting(row.original)}
              >
                <Trash2 className="text-danger" /> {t('common:actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleStatus only closes over the stable mutation
    [t, i18n.language, vesselNames, keyNames],
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(t('devices.toasts.deleted', { name: deleting.name }));
    } catch (error) {
      toast.error(t('devices.toasts.deleteFailed'), { description: problemMessage(t, error) });
    } finally {
      setDeleting(null);
    }
  };

  const filtered = term !== '' || kind !== ALL || status !== ALL || vessel !== ALL;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('devices.title')}
        description={t('devices.description')}
        icon={Cpu}
        actions={
          <>
            <OrgContextPicker context={context} allowAll />
            <Button onClick={() => setForm({})} disabled={!context.orgId}>
              <Plus /> {t('devices.create')}
            </Button>
          </>
        }
      />
      <section
        aria-label={t('devices.statsLabel')}
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <StatCard
          label={t('devices.stats.total')}
          value={formatNumber(stats.total, i18n.language)}
          icon={Cpu}
          tone="primary"
          loading={overview.isPending}
        />
        <StatCard
          label={t('devices.stats.active')}
          value={formatNumber(stats.active, i18n.language)}
          description={t('devices.stats.activeHint')}
          icon={Power}
          loading={overview.isPending}
        />
        <StatCard
          label={t('devices.stats.online')}
          value={formatNumber(stats.online, i18n.language)}
          description={t('devices.stats.onlineHint')}
          icon={Wifi}
          tone="success"
          loading={overview.isPending}
        />
        <StatCard
          label={t('devices.stats.transport')}
          value={`${formatNumber(stats.mqtt, i18n.language)} · ${formatNumber(stats.http, i18n.language)}`}
          description={t('devices.stats.transportHint')}
          icon={Radio}
          loading={overview.isPending}
        />
      </section>
      <section aria-labelledby="devices-title" className="min-w-0">
        <h2 id="devices-title" className="sr-only">
          {t('devices.listTitle')}
        </h2>
        <DataTable
          ariaLabel={t('devices.tableLabel')}
          columns={columns}
          data={devices.data?.data}
          loading={devices.isPending}
          error={devices.error}
          onRetry={() => void devices.refetch()}
          getRowId={(device) => device.id}
          pagination={paging.adapter(devices.data?.meta)}
          enableColumnVisibility
          toolbar={
            <>
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  paging.setPage(1);
                }}
                label={t('devices.search')}
                placeholder={t('devices.searchPlaceholder')}
              />
              <Select
                value={vessel}
                onValueChange={(value) => {
                  setVessel(value);
                  paging.setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-52" aria-label={t('devices.vesselFilter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('devices.allVessels')}</SelectItem>
                  {(vessels.data?.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.mmsi)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value);
                  paging.setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-36" aria-label={t('devices.kindFilter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('devices.allKinds')}</SelectItem>
                  <SelectItem value="mqtt">{t('devices.kinds.mqtt')}</SelectItem>
                  <SelectItem value="http">{t('devices.kinds.http')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  paging.setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-36" aria-label={t('devices.statusFilter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('devices.allStatuses')}</SelectItem>
                  <SelectItem value="active">{t('devices.statuses.active')}</SelectItem>
                  <SelectItem value="inactive">{t('devices.statuses.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          emptyState={
            filtered ? (
              <EmptyState
                size="sm"
                title={t('devices.noMatches')}
                description={t('devices.noMatchesHint')}
              />
            ) : (
              <EmptyState
                size="sm"
                icon={Cpu}
                title={t('devices.empty')}
                description={t('devices.emptyHint')}
                action={
                  <Button size="sm" onClick={() => setForm({})} disabled={!context.orgId}>
                    <Plus /> {t('devices.create')}
                  </Button>
                }
              />
            )
          }
        />
      </section>
      <DeviceFormDialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        device={form?.device}
        orgId={context.orgId}
        onCreated={(device) => setConnecting(device)}
      />
      <ConnectionSheet
        device={connecting}
        vesselName={
          connecting ? (connecting.vesselName ?? vesselNames.get(connecting.mmsi) ?? null) : null
        }
        onOpenChange={(open) => !open && setConnecting(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('devices.deleteConfirm.title', { name: deleting?.name ?? '' })}
        description={t('devices.deleteConfirm.description')}
        confirmLabel={t('common:actions.delete')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
