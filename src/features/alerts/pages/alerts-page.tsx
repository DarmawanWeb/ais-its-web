import {
  ALERT_DOMAINS,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  alertDomainLabel,
  alertTypeLabel,
} from '@darmawanweb/ais-its-contracts/domain';
import { keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BellRing,
  Download,
  FilterX,
  OctagonAlert,
  Radio,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateRange } from 'react-day-picker';

import {
  useAlertsControllerList,
  useAlertsControllerSummary,
} from '@/shared/api/generated/notification/alerts/alerts';
import type { AlertDto } from '@/shared/api/generated/notification/model';
import { useCursorState } from '@/shared/domain-ui/data-table/adapters';
import { DataTable } from '@/shared/domain-ui/data-table/data-table';
import { SeverityBadge } from '@/shared/domain-ui/badges';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { downloadCsv } from '@/shared/lib/csv';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { useRealtimeConnection } from '@/shared/realtime/hooks';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DateRangePicker } from '@/shared/ui/date-range-picker';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';
import { Spinner } from '@/shared/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { AlertActions } from '../components/alert-actions';
import { AlertStatusBadge, AlertTypeLabel } from '../components/alert-badges';
import { AlertDetailSheet } from '../components/alert-detail-sheet';
import { useAlertFilters } from '../hooks/use-alert-filters';
import { useAppLanguage } from '@/shared/i18n';
import { useLiveAlerts } from '../hooks/use-live-alerts';
import { alertCsvRows, exportFileName, fetchAlertsForExport } from '../lib/alert-csv';
import { localizeProblem } from '@/shared/api/problem-copy';
import { alertProblemCopies } from '../lib/problems';
import {
  activeFilterCount,
  ALERT_PAGE_SIZE,
  type AlertFilters,
  toListParams,
  typeOptions,
} from '../lib/alert-filters';

const STATUS_OPTIONS = ['open', 'acknowledged', 'resolved', 'all'] as const;

/** A calendar day picked as the end of a range includes the whole day. */
function endOfDayIfMidnight(date: Date): Date {
  const midnight =
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;
  return midnight ? new Date(date.getTime() + 86_399_999) : date;
}

function useAlertColumns(freshIds: ReadonlySet<string>): ColumnDef<AlertDto>[] {
  const { t, i18n } = useTranslation('alerts');
  return useMemo<ColumnDef<AlertDto>[]>(
    () => [
      {
        id: 'severity',
        header: t('table.severity'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <SeverityBadge severity={row.original.severity} />
            {freshIds.has(row.original.id) && (
              <Badge variant="primary" className="animate-pulse" data-testid="alert-fresh">
                {t('table.new')}
              </Badge>
            )}
          </div>
        ),
        meta: { className: 'w-[1%]' },
      },
      {
        id: 'alert',
        header: t('table.alert'),
        cell: ({ row }) => (
          <div className="max-w-[34rem] min-w-[14rem] space-y-1 whitespace-normal">
            <p className="line-clamp-1 font-medium" title={row.original.title}>
              {row.original.title}
            </p>
            <p className="line-clamp-1 text-xs text-muted-foreground" title={row.original.message}>
              {row.original.message}
            </p>
            <AlertTypeLabel
              type={row.original.type}
              domain={row.original.domain}
              className="text-xs text-muted-foreground"
            />
          </div>
        ),
      },
      {
        id: 'vessel',
        header: t('table.vessel'),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 text-xs">
            <MmsiText mmsi={row.original.mmsi} className="text-sm" />
            {row.original.relatedMmsi !== null && (
              <span className="text-muted-foreground">
                ↔ <MmsiText mmsi={row.original.relatedMmsi} />
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: t('table.status'),
        cell: ({ row }) => <AlertStatusBadge status={row.original.status} />,
      },
      {
        id: 'occurrences',
        header: () => <span title={t('table.occurrencesHint')}>{t('table.occurrences')}</span>,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.occurrences}×</span>
        ),
        meta: { className: 'hidden text-right lg:table-cell' },
      },
      {
        id: 'time',
        header: t('table.lastOccurred'),
        cell: ({ row }) => (
          <time
            dateTime={row.original.lastOccurredAt}
            title={formatDateTime(
              row.original.lastOccurredAt,
              i18n.language,
              'dd MMM yyyy HH:mm:ss',
            )}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {formatRelativeTime(row.original.lastOccurredAt, i18n.language)}
          </time>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.actions')}</span>,
        cell: ({ row }) => <AlertActions alert={row.original} />,
        meta: { className: 'w-[1%] text-right', alwaysVisible: true },
      },
    ],
    [t, i18n.language, freshIds],
  );
}

/**
 * MMSI filter: typed locally, committed to the URL after a pause; a change of the URL from
 * elsewhere (reset, navigation) replaces the text unless it is the value just committed.
 */
function MmsiFilterInput({ value, onCommit }: { value: string; onCommit: (mmsi: string) => void }) {
  const { t } = useTranslation('alerts');
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 400);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== debounced) setText(value);
  }
  const commit = useEffectEvent((mmsi: string) => {
    if (mmsi !== value) onCommit(mmsi);
  });
  useEffect(() => commit(debounced), [debounced]);
  return (
    <div className="relative">
      <Label htmlFor="alert-filter-mmsi" className="sr-only">
        {t('filters.mmsi')}
      </Label>
      <Input
        id="alert-filter-mmsi"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('filters.mmsiPlaceholder')}
        value={text}
        onChange={(event) => setText(event.target.value.replace(/\D/g, '').slice(0, 9))}
        className="h-8 font-mono text-sm"
      />
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
  resetFilters,
}: {
  filters: AlertFilters;
  setFilters: (patch: Partial<AlertFilters>) => void;
  resetFilters: () => void;
}) {
  const { t } = useTranslation('alerts');
  const locale = useAppLanguage();
  const range: DateRange | undefined =
    filters.from || filters.to
      ? {
          from: filters.from ? new Date(filters.from) : undefined,
          to: filters.to ? new Date(filters.to) : undefined,
        }
      : undefined;
  const types = typeOptions(filters.domain);
  const active = activeFilterCount(filters);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-surface p-3 shadow-xs"
      role="search"
      aria-label={t('filters.label')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={filters.status}
          onValueChange={(value) =>
            value && setFilters({ status: value as AlertFilters['status'] })
          }
          aria-label={t('filters.status')}
          className="flex-wrap"
        >
          {STATUS_OPTIONS.map((status) => (
            <ToggleGroupItem
              key={status}
              value={status}
              className="px-3"
              data-testid={`alert-status-${status}`}
            >
              {status === 'all' ? t('filters.statuses.all') : ALERT_STATUS_LABELS[status][locale]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto">
            <FilterX /> {t('filters.reset')}
            <Badge variant="muted" className="ml-0.5">
              {active}
            </Badge>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,11rem))_minmax(0,12rem)_minmax(0,1fr)]">
        <Select
          value={filters.severity}
          onValueChange={(value) => setFilters({ severity: value as AlertFilters['severity'] })}
        >
          <SelectTrigger size="sm" aria-label={t('filters.severity')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allSeverities')}</SelectItem>
            {[...ALERT_SEVERITIES].reverse().map((severity) => (
              <SelectItem key={severity} value={severity}>
                {ALERT_SEVERITY_LABELS[severity][locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.domain}
          onValueChange={(value) => {
            const domain = value as AlertFilters['domain'];
            const keepType = filters.type === 'all' || typeOptions(domain).includes(filters.type);
            setFilters({ domain, ...(keepType ? {} : { type: 'all' }) });
          }}
        >
          <SelectTrigger size="sm" aria-label={t('filters.domain')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allDomains')}</SelectItem>
            {ALERT_DOMAINS.map((domain) => (
              <SelectItem key={domain} value={domain}>
                {alertDomainLabel(domain, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={(value) => setFilters({ type: value })}>
          <SelectTrigger size="sm" aria-label={t('filters.type')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {alertTypeLabel(type, locale)}
              </SelectItem>
            ))}
            {filters.type !== 'all' && !types.includes(filters.type) && (
              <SelectItem value={filters.type}>{filters.type}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <MmsiFilterInput value={filters.mmsi} onCommit={(mmsi) => setFilters({ mmsi })} />
        <div className="min-w-0">
          <DateRangePicker
            value={range}
            onChange={(next) =>
              setFilters({
                from: next?.from ? next.from.toISOString() : null,
                to: next?.to ? endOfDayIfMidnight(next.to).toISOString() : null,
              })
            }
            label={t('filters.range')}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

/** Alert inbox (notification service, spec §13.9): filters, live list, detail drawer, export. */
export function AlertsPage() {
  const { t, i18n } = useTranslation('alerts');
  const locale = useAppLanguage();
  const { filters, setFilters, resetFilters, selectedId, selectAlert } = useAlertFilters();
  const cursor = useCursorState();
  const { connected } = useRealtimeConnection();
  const [exporting, setExporting] = useState(false);

  const filterKey = JSON.stringify(filters);
  const { reset: resetCursor } = cursor;
  useEffect(() => resetCursor(), [filterKey, resetCursor]);

  const params = useMemo(
    () => ({
      ...toListParams(filters, ALERT_PAGE_SIZE),
      ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
    }),
    [filters, cursor.cursor],
  );
  const list = useAlertsControllerList(params, { query: { placeholderData: keepPreviousData } });
  const summary = useAlertsControllerSummary({ query: { staleTime: 15_000 } });
  const live = useLiveAlerts({ filters, params, firstPage: cursor.pageIndex === 0 });
  const columns = useAlertColumns(live.freshIds);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { limit: _limit, ...query } = toListParams(filters);
      const { alerts, truncated } = await fetchAlertsForExport(query);
      if (alerts.length === 0) {
        toast.info(t('export.empty'));
        return;
      }
      downloadCsv(exportFileName(), alertCsvRows(alerts, locale));
      toast.success(t('export.done', { count: alerts.length }), {
        ...(truncated ? { description: t('export.truncated', { count: alerts.length }) } : {}),
      });
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const bySeverity = summary.data?.bySeverity;
  const byDomain = summary.data?.byDomain;
  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.operations')}
        icon={BellRing}
        title={t('alerts.title')}
        description={t('alerts.description')}
        actions={
          <>
            <Badge
              variant={connected ? 'success' : 'muted'}
              className="h-8 gap-1.5 px-2.5"
              data-testid="alerts-live"
            >
              <Radio className={connected ? 'animate-pulse' : ''} aria-hidden />
              {connected ? t('page.live') : t('page.offline')}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportCsv()}
              disabled={exporting}
              data-testid="alerts-export"
            >
              {exporting ? <Spinner /> : <Download />} {t('common:actions.exportCsv')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('summary.open')}
          value={formatNumber(summary.data?.total, i18n.language)}
          icon={BellRing}
          tone="primary"
          loading={summary.isPending}
          description={
            byDomain
              ? t('summary.byDomain', {
                  safety: formatNumber(byDomain.safety, i18n.language),
                  surveillance: formatNumber(byDomain.surveillance, i18n.language),
                })
              : summary.isError
                ? t('summary.unavailable')
                : undefined
          }
        />
        <StatCard
          label={t('summary.critical')}
          value={formatNumber(bySeverity?.critical, i18n.language)}
          icon={OctagonAlert}
          tone="danger"
          loading={summary.isPending}
          description={t('summary.criticalHint')}
        />
        <StatCard
          label={t('summary.warning')}
          value={formatNumber(bySeverity?.warning, i18n.language)}
          icon={TriangleAlert}
          tone="warning"
          loading={summary.isPending}
          description={t('summary.warningHint', { count: bySeverity?.info ?? 0 })}
        />
      </div>

      <section aria-labelledby="alerts-inbox-title" className="flex min-w-0 flex-col gap-3">
        <h2 id="alerts-inbox-title" className="sr-only">
          {t('page.inbox')}
        </h2>
        <FilterBar filters={filters} setFilters={setFilters} resetFilters={resetFilters} />
        {live.missed > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
            role="status"
          >
            <span>{t('page.missed', { count: live.missed })}</span>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                live.clearMissed();
                resetCursor();
              }}
            >
              {t('page.backToFirst')}
            </Button>
          </div>
        )}
        <DataTable
          ariaLabel={t('page.inbox')}
          columns={columns}
          data={list.data?.data}
          loading={list.isPending}
          error={list.isError ? localizeProblem(list.error, alertProblemCopies(t)) : undefined}
          onRetry={() => void list.refetch()}
          getRowId={(row) => row.id}
          onRowClick={(row) => selectAlert(row.id)}
          pagination={cursor.adapter(list.data?.page.nextCursor, list.isFetching)}
          emptyState={
            filtered ? (
              <EmptyState
                size="sm"
                icon={FilterX}
                title={t('empty.filteredTitle')}
                description={t('empty.filteredDescription')}
                action={
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    {t('filters.reset')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon={ShieldAlert}
                title={t('empty.title')}
                description={t('empty.description')}
              />
            )
          }
        />
      </section>

      <AlertDetailSheet alertId={selectedId} onOpenChange={(open) => !open && selectAlert(null)} />
    </div>
  );
}
