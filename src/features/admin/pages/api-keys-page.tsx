import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Gauge, KeyRound, Plus, Radio, RotateCw, Satellite } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ApiKeyDto } from '@/shared/api/generated/auth/model';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/sonner';
import { Switch } from '@/shared/ui/switch';

import { useAllMembers, useApiKeys, useRevokeApiKey } from '../api/auth-admin';
import { OrgContextPicker } from '../components/common';
import { CreateApiKeyDialog, RotateApiKeyDialog } from '../components/create-api-key-dialog';
import { useOrgContext } from '../hooks/use-org-context';
import { problemMessage } from '@/shared/api/problem-copy';

const SCOPE_GUIDE = [
  { scope: 'telemetry:ingest', icon: Gauge, endpoint: 'POST /api/v2/telemetry/readings' },
  { scope: 'ais:read', icon: Radio, endpoint: 'GET /api/v2/ais/latest · /ais/vessels/:mmsi/track' },
  { scope: 'ais:ingest', icon: Satellite, endpoint: 'POST /api/v2/ingest/ais' },
] as const;

/** API keys of an organization (api_key:manage): create (shown once) and revoke. */
export function ApiKeysPage() {
  const { t, i18n } = useTranslation('admin');
  const context = useOrgContext();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const paging = usePageState({ pageSize: 20 });
  const keys = useApiKeys({
    orgId: context.isPlatformAdmin ? (context.orgId ?? undefined) : undefined,
    includeRevoked,
    page: paging.page,
    pageSize: paging.pageSize,
    enabled: !!context.orgId,
  });
  const members = useAllMembers(context.orgId);
  const revoke = useRevokeApiKey();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyDto | null>(null);
  const [rotating, setRotating] = useState<ApiKeyDto | null>(null);
  const memberNames = useMemo(
    () => new Map((members.data?.data ?? []).map((m) => [m.userId, m.name || m.email])),
    [members.data],
  );

  const columns = useMemo<ColumnDef<ApiKeyDto>[]>(
    () => [
      {
        id: 'name',
        header: t('apiKeys.columns.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.original.prefix}_••••••••
            </p>
          </div>
        ),
      },
      {
        id: 'scopes',
        header: t('apiKeys.columns.scopes'),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.scopes.map((scope) => (
              <Badge
                key={scope}
                variant={scope === 'ais:ingest' ? 'warning' : 'outline'}
                className="font-mono"
              >
                {scope}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        id: 'created',
        header: t('apiKeys.columns.created'),
        cell: ({ row }) => (
          <div className="min-w-0 text-sm">
            <p>{formatDateTime(row.original.createdAt, i18n.language, 'dd MMM yyyy')}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.createdBy
                ? (memberNames.get(row.original.createdBy) ?? t('apiKeys.unknownCreator'))
                : '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'lastUsed',
        header: t('apiKeys.columns.lastUsed'),
        cell: ({ row }) =>
          row.original.lastUsedAt ? (
            <span title={formatDateTime(row.original.lastUsedAt, i18n.language)}>
              {formatRelativeTime(row.original.lastUsedAt, i18n.language)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('common.never')}</span>
          ),
      },
      {
        id: 'status',
        header: t('apiKeys.columns.status'),
        cell: ({ row }) => {
          const key = row.original;
          if (key.status === 'revoked' || key.revokedAt) {
            return (
              <Badge variant="muted" title={formatDateTime(key.revokedAt, i18n.language)}>
                {t('apiKeys.revokedOn', {
                  date: formatDateTime(key.revokedAt, i18n.language, 'dd MMM yyyy'),
                })}
              </Badge>
            );
          }
          return (
            <div className="grid justify-items-start gap-1">
              {key.status === 'expired' ? (
                <Badge variant="warning">{t('apiKeys.expired')}</Badge>
              ) : (
                <Badge variant="success">{t('apiKeys.active')}</Badge>
              )}
              {key.expiresAt && (
                <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                  {t('apiKeys.expiresOn', {
                    date: formatDateTime(key.expiresAt, i18n.language, 'dd MMM yyyy'),
                  })}
                </span>
              )}
              {key.previousKeyExpiresAt && Date.parse(key.previousKeyExpiresAt) > Date.now() && (
                <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                  {t('apiKeys.previousUntil', {
                    date: formatDateTime(key.previousKeyExpiresAt, i18n.language, 'dd MMM HH:mm'),
                  })}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        meta: { className: 'text-right', alwaysVisible: true },
        cell: ({ row }) =>
          row.original.revokedAt ? null : (
            <div className="flex justify-end gap-1">
              {row.original.status !== 'expired' && (
                <Button variant="ghost" size="sm" onClick={() => setRotating(row.original)}>
                  <RotateCw /> {t('apiKeys.rotate.action')}
                  <span className="sr-only">: {row.original.name}</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setRevoking(row.original)}
              >
                <Ban /> {t('apiKeys.revoke')}
                <span className="sr-only">: {row.original.name}</span>
              </Button>
            </div>
          ),
      },
    ],
    [t, i18n.language, memberNames],
  );

  const confirmRevoke = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      toast.success(t('apiKeys.toasts.revoked', { name: revoking.name }));
    } catch (error) {
      toast.error(t('apiKeys.toasts.revokeFailed'), { description: problemMessage(t, error) });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('apiKeys.title')}
        description={t('apiKeys.description')}
        icon={KeyRound}
        actions={
          <>
            <OrgContextPicker context={context} />
            <Button onClick={() => setCreating(true)} disabled={!context.orgId}>
              <Plus /> {t('apiKeys.create')}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="api-keys-title" className="min-w-0 space-y-3">
          <h2 id="api-keys-title" className="sr-only">
            {t('apiKeys.listTitle')}
          </h2>
          <DataTable
            ariaLabel={t('apiKeys.tableLabel')}
            columns={columns}
            data={keys.data?.data}
            loading={keys.isPending && !!context.orgId}
            error={keys.error}
            onRetry={() => void keys.refetch()}
            getRowId={(key) => key.id}
            pagination={paging.adapter(keys.data?.meta)}
            toolbar={
              <div className="flex items-center gap-2">
                <Switch
                  id="include-revoked"
                  checked={includeRevoked}
                  onCheckedChange={(checked) => {
                    setIncludeRevoked(checked);
                    paging.setPage(1);
                  }}
                />
                <Label htmlFor="include-revoked" className="font-normal">
                  {t('apiKeys.includeRevoked')}
                </Label>
              </div>
            }
            emptyState={
              <EmptyState
                size="sm"
                icon={KeyRound}
                title={t('apiKeys.empty')}
                description={t('apiKeys.emptyHint')}
                action={
                  <Button size="sm" onClick={() => setCreating(true)} disabled={!context.orgId}>
                    <Plus /> {t('apiKeys.create')}
                  </Button>
                }
              />
            }
          />
        </section>
        <Section title={t('apiKeys.guide.title')} description={t('apiKeys.guide.description')}>
          <ul className="grid gap-4 md:grid-cols-3 2xl:grid-cols-1 2xl:gap-3">
            {SCOPE_GUIDE.map(({ scope, icon: Icon, endpoint }) => (
              <li key={scope} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-sm font-medium">{scope}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`apiKeys.scopes.${scope.replace(':', '_')}`)}
                  </p>
                  <p className="font-mono text-[11px] break-words text-muted-foreground">
                    {endpoint}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{t('apiKeys.guide.header')}</p>
        </Section>
      </div>
      <CreateApiKeyDialog
        open={creating}
        onOpenChange={setCreating}
        orgId={context.orgId}
        orgName={context.orgName}
        isPlatformAdmin={context.isPlatformAdmin}
      />
      <RotateApiKeyDialog apiKey={rotating} onOpenChange={(open) => !open && setRotating(null)} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('apiKeys.revokeConfirm.title', { name: revoking?.name ?? '' })}
        description={t('apiKeys.revokeConfirm.description')}
        confirmLabel={t('apiKeys.revoke')}
        destructive
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
