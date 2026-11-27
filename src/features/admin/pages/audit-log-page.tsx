import type { ColumnDef } from '@tanstack/react-table';
import { Download, Filter, ScrollText, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { downloadServerFile } from '@/shared/api/download';
import type { AuditLogDto } from '@/shared/api/generated/auth/model';
import { problemMessage } from '@/shared/api/problem-copy';
import { DataTable, useCursorState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DateRangePicker,
  type DateRange,
  presetRange,
  toIsoRange,
} from '@/shared/ui/date-range-picker';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';

import { useAllMembers, useAuditActions, useAuditLogs } from '../api/auth-admin';
import { OrgContextPicker } from '../components/common';
import { ActionBadge, AuditDetailSheet } from '../components/audit-detail-sheet';
import { useOrgContext } from '../hooks/use-org-context';
import { actionKey, KNOWN_AUDIT_ACTIONS, KNOWN_TARGET_TYPES, shortId } from '../lib/audit';

const ANY = 'any';

/** Central audit log (audit:read): who did what, when and from where — newest first. */
export function AuditLogPage() {
  const { t, i18n } = useTranslation('admin');
  const context = useOrgContext({ allowAll: true });
  const actionsListId = useId();
  const [range, setRange] = useState<DateRange | undefined>(() => presetRange('last30d'));
  const [actor, setActor] = useState<string>(ANY);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState<string>(ANY);
  const [targetId, setTargetId] = useState('');
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const cursor = useCursorState();
  const debouncedAction = useDebouncedValue(action.trim(), 350);
  const debouncedTarget = useDebouncedValue(targetId.trim(), 350);
  const members = useAllMembers(context.orgId);
  // Names captured by the auth service with each record (actorName, orgName, targetLabel);
  // the members list only fills in records stored before auth 0.2.
  const memberNames = useMemo(
    () => new Map((members.data?.data ?? []).map((m) => [m.userId, m.name || m.email] as const)),
    [members.data],
  );
  const { from, to } = toIsoRange(range);
  const scopeOrg = context.isPlatformAdmin && context.orgId ? { orgId: context.orgId } : {};
  const actions = useAuditActions({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...scopeOrg,
  });
  const suggestions = useMemo(() => {
    const recorded = (actions.data?.data ?? []).map((item) => item.action);
    return [...new Set([...recorded, ...KNOWN_AUDIT_ACTIONS])];
  }, [actions.data]);
  const filters = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(actor !== ANY ? { actorId: actor } : {}),
    ...(debouncedAction ? { action: debouncedAction } : {}),
    ...(targetType !== ANY ? { targetType } : {}),
    ...(debouncedTarget ? { targetId: debouncedTarget } : {}),
    ...scopeOrg,
  };
  const logs = useAuditLogs({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(actor !== ANY ? { actorId: actor } : {}),
    ...(debouncedAction ? { action: debouncedAction } : {}),
    ...(targetType !== ANY ? { targetType } : {}),
    ...(debouncedTarget ? { targetId: debouncedTarget } : {}),
    ...(context.isPlatformAdmin && context.orgId ? { orgId: context.orgId } : {}),
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  });
  const reset = cursor.reset;
  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      reset();
    };
  const filtered = actor !== ANY || action !== '' || targetType !== ANY || targetId !== '';
  const actorName = (record: AuditLogDto) =>
    record.actorName ?? (record.actorId ? (memberNames.get(record.actorId) ?? null) : null);

  const columns = useMemo<ColumnDef<AuditLogDto>[]>(
    () => [
      {
        id: 'at',
        header: t('auditLog.columns.at'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-nowrap">
            <p className="font-mono text-xs tabular-nums">
              {formatDateTime(row.original.at, i18n.language, 'dd MMM yyyy HH:mm:ss')}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.at, i18n.language)}
            </p>
          </div>
        ),
      },
      {
        id: 'actor',
        header: t('auditLog.columns.actor'),
        cell: ({ row }) => {
          const record = row.original;
          const name =
            record.actorName ?? (record.actorId ? memberNames.get(record.actorId) : undefined);
          return (
            <div className="min-w-0">
              <p className="truncate">{name ?? t(`auditLog.actorTypes.${record.actorType}`)}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {record.actorEmail ?? shortId(record.actorId)}
              </p>
            </div>
          );
        },
      },
      {
        id: 'action',
        header: t('auditLog.columns.action'),
        cell: ({ row }) => <ActionBadge action={row.original.action} />,
      },
      {
        id: 'target',
        header: t('auditLog.columns.target'),
        cell: ({ row }) =>
          row.original.targetType ? (
            <div className="min-w-0">
              <p className="truncate">
                {t(`auditLog.targetTypes.${row.original.targetType}`, {
                  defaultValue: row.original.targetType,
                })}
              </p>
              <p
                className={cn(
                  'truncate text-[11px] text-muted-foreground',
                  !row.original.targetLabel && 'font-mono',
                )}
              >
                {row.original.targetLabel ?? shortId(row.original.targetId)}
              </p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'source',
        header: t('auditLog.columns.source'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.source}</span>,
      },
      {
        id: 'ip',
        header: t('auditLog.columns.ip'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip ?? '—'}</span>,
      },
    ],
    [t, i18n.language, memberNames],
  );

  const [exporting, setExporting] = useState(false);
  /** Every record of the filters as one streamed file (`GET /audit-logs.csv`). */
  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadServerFile(
        '/api/v2/audit-logs.csv',
        filters,
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (error) {
      toast.error(t('auditLog.exportFailed'), { description: problemMessage(t, error) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('auditLog.title')}
        description={t('auditLog.description')}
        icon={ScrollText}
        actions={
          <>
            <OrgContextPicker context={context} allowAll />
            <Button
              variant="outline"
              onClick={() => void exportCsv()}
              disabled={exporting || (logs.data?.data.length ?? 0) === 0}
            >
              <Download /> {t('common:actions.exportCsv')}
            </Button>
          </>
        }
      />
      <section
        aria-labelledby="audit-filters"
        className="rounded-xl border bg-surface p-4 shadow-xs"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="audit-filters" className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="size-4 text-primary" aria-hidden /> {t('auditLog.filters.title')}
          </h2>
          {filtered && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setActor(ANY);
                setAction('');
                setTargetType(ANY);
                setTargetId('');
                reset();
              }}
            >
              <X /> {t('auditLog.filters.clear')}
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('auditLog.filters.time')}
            </span>
            <DateRangePicker
              value={range}
              onChange={change(setRange)}
              label={t('auditLog.filters.time')}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="audit-actor" className="text-xs font-medium text-muted-foreground">
              {t('auditLog.filters.actor')}
            </label>
            <Select value={actor} onValueChange={change(setActor)}>
              <SelectTrigger id="audit-actor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('auditLog.filters.anyActor')}</SelectItem>
                {(members.data?.data ?? []).map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="audit-action" className="text-xs font-medium text-muted-foreground">
              {t('auditLog.filters.action')}
            </label>
            <Input
              id="audit-action"
              value={action}
              onChange={(event) => change(setAction)(event.target.value)}
              list={actionsListId}
              placeholder="membership.update"
              className="font-mono text-sm"
              spellCheck={false}
            />
            <datalist id={actionsListId}>
              {suggestions.map((value) => (
                <option key={value} value={value}>
                  {t(actionKey(value), { defaultValue: value })}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="audit-target-type"
              className="text-xs font-medium text-muted-foreground"
            >
              {t('auditLog.filters.targetType')}
            </label>
            <Select value={targetType} onValueChange={change(setTargetType)}>
              <SelectTrigger id="audit-target-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('auditLog.filters.anyTarget')}</SelectItem>
                {KNOWN_TARGET_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`auditLog.targetTypes.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="audit-target-id" className="text-xs font-medium text-muted-foreground">
              {t('auditLog.filters.targetId')}
            </label>
            <Input
              id="audit-target-id"
              value={targetId}
              onChange={(event) => change(setTargetId)(event.target.value)}
              placeholder="0192f0c8-…"
              className="font-mono text-sm"
              spellCheck={false}
            />
          </div>
        </div>
      </section>
      <section aria-labelledby="audit-records" className="min-w-0">
        <h2 id="audit-records" className="sr-only">
          {t('auditLog.records')}
        </h2>
        <DataTable
          ariaLabel={t('auditLog.tableLabel')}
          columns={columns}
          data={logs.data?.data}
          loading={logs.isPending}
          error={logs.error}
          onRetry={() => void logs.refetch()}
          getRowId={(record) => record.id}
          onRowClick={setSelected}
          selectedRowId={selected?.id ?? null}
          density="compact"
          pagination={cursor.adapter(logs.data?.page.nextCursor, logs.isFetching)}
          emptyState={
            <EmptyState
              size="sm"
              icon={ScrollText}
              title={filtered ? t('auditLog.noMatches') : t('auditLog.empty')}
              description={filtered ? t('auditLog.noMatchesHint') : t('auditLog.emptyHint')}
            />
          }
        />
      </section>
      <AuditDetailSheet
        record={selected}
        actorName={selected ? actorName(selected) : null}
        orgName={
          selected?.orgId
            ? (selected.orgName ??
              context.options.find((org) => org.id === selected.orgId)?.name ??
              (selected.orgId === context.orgId ? context.orgName : null))
            : null
        }
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
