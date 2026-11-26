import {
  EWS_STATUS_LABELS,
  SAFETY_EVENT_STATUS_LABELS,
  type EwsStatus,
} from '@darmawanweb/ais-its-contracts/domain';
import { keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BellRing,
  Cable,
  MapPin,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { useZonesControllerGeojson } from '@/shared/api/generated/geo/zones/zones';
import { useDetectorsControllerList } from '@/shared/api/generated/safety/detectors/detectors';
import { useEventsControllerList } from '@/shared/api/generated/safety/events/events';
import type { SafetyEventDto, SafetyVesselStateDto } from '@/shared/api/generated/safety/model';
import { useVesselStatesControllerList } from '@/shared/api/generated/safety/vessels/vessels';
import { usePermission } from '@/shared/auth/hooks';
import { EwsStatusBadge, NavstatusLabel, SeverityBadge } from '@/shared/domain-ui/badges';
import { useCursorState } from '@/shared/domain-ui/data-table/adapters';
import { DataTable } from '@/shared/domain-ui/data-table/data-table';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { EwsMap } from '../components/ews-map';
import { EwsRuleCard } from '../components/ews-rule-card';
import { useVesselNames } from '../hooks/use-vessel-names';
import {
  countByEwsStatus,
  EWS_FILTER_STATUSES,
  ewsEventFacts,
  formatEwsStatusParam,
  parseEwsStatusParam,
  pipelineNames,
  sortEwsStates,
} from '../lib/ews';
import { localizeProblem } from '@/shared/api/problem-copy';
import { safetyProblemCopies } from '../lib/problems';
import { ewsThresholdsOf } from '../lib/thresholds';

/** Largest list of vessel states requested at once (the API allows 10 000). */
const STATE_LIMIT = 1_000;
const ARRAY_PARAMS = { paramsSerializer: { indexes: null } } as const;

function useVesselColumns(
  names: Map<string, string>,
  selectedMmsi: number | null,
): ColumnDef<SafetyVesselStateDto>[] {
  const { t, i18n } = useTranslation('safety');
  return useMemo<ColumnDef<SafetyVesselStateDto>[]>(
    () => [
      {
        id: 'vessel',
        header: t('ews.table.vessel'),
        cell: ({ row }) => {
          const selected = row.original.mmsi === selectedMmsi;
          return (
            <div className="flex min-w-[9rem] items-start gap-2">
              {/* Selection on the map: a pin and a border, not a row tint (badge contrast). */}
              <span
                className={
                  selected
                    ? 'mt-0.5 h-8 w-1 shrink-0 rounded-full bg-primary'
                    : 'mt-0.5 h-8 w-1 shrink-0'
                }
                aria-hidden
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-medium">
                  {row.original.vessel?.name ?? t('common:status.noData')}
                  {selected && (
                    <MapPin
                      className="size-3.5 text-primary"
                      aria-label={t('ews.table.selected')}
                    />
                  )}
                </p>
                <MmsiText mmsi={row.original.mmsi} className="text-xs text-muted-foreground" />
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('ews.table.status')}
            <MethodInfo methodId="ews.pipeline_distance_status" />
          </span>
        ),
        cell: ({ row }) => <EwsStatusBadge status={row.original.ewsStatus} />,
      },
      {
        id: 'distance',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('ews.table.distance')}
            <MethodInfo methodId="ews.pipeline_distance_status" />
          </span>
        ),
        cell: ({ row }) =>
          row.original.pipelineDistanceM === null ? (
            <span className="text-xs text-muted-foreground" title={t('ews.table.distanceHidden')}>
              —
            </span>
          ) : (
            <UnitValue value={row.original.pipelineDistanceM} unit="m" />
          ),
        meta: { className: 'text-right' },
      },
      {
        id: 'pipeline',
        header: t('ews.table.pipeline'),
        cell: ({ row }) => {
          const id = row.original.nearestPipelineZoneId;
          return id ? (
            <span className="line-clamp-2 min-w-[8rem] text-sm whitespace-normal">
              {names.get(id) ?? t('ews.table.pipelineUnknown')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t('ews.table.noPipeline')}</span>
          );
        },
        meta: { className: 'hidden md:table-cell xl:hidden 2xl:table-cell' },
      },
      {
        id: 'navstatus',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('ews.table.navstatus')}
            <MethodInfo methodId="navstatus.prediction" />
          </span>
        ),
        cell: ({ row }) => (
          <NavstatusLabel
            code={row.original.navstatus}
            predicted={row.original.predictedNavstatus}
            className="max-w-[12rem] text-sm"
          />
        ),
        meta: { className: 'hidden lg:table-cell xl:hidden 2xl:table-cell' },
      },
      {
        id: 'updated',
        header: t('ews.table.updated'),
        cell: ({ row }) => (
          <time
            dateTime={row.original.positionTime}
            title={formatDateTime(row.original.positionTime, i18n.language, 'dd MMM yyyy HH:mm:ss')}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {formatRelativeTime(row.original.positionTime, i18n.language)}
          </time>
        ),
        meta: { className: 'hidden sm:table-cell' },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ews.table.actions')}</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-xs"
            asChild
            onClick={(event) => event.stopPropagation()}
          >
            <Link
              to={`/map?vessel=${row.original.mmsi}`}
              aria-label={t('ews.table.openMap', {
                name: row.original.vessel?.name ?? row.original.mmsi,
              })}
              title={t('ews.table.openMapShort')}
            >
              <MapPin />
            </Link>
          </Button>
        ),
        meta: { className: 'w-[1%]', alwaysVisible: true },
      },
    ],
    [t, i18n.language, names, selectedMmsi],
  );
}

type EventStatusFilter = 'open' | 'resolved' | 'all';

function EwsEvents({ vesselNames }: { vesselNames: Map<number, string> }) {
  const { t, i18n } = useTranslation('safety');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const [status, setStatus] = useState<EventStatusFilter>('all');
  const cursor = useCursorState();
  const { reset } = cursor;
  useEffect(() => reset(), [status, reset]);
  const params = {
    detector: 'ews',
    limit: 15,
    ...(status === 'all' ? {} : { status }),
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  };
  const query = useEventsControllerList(params, {
    query: { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  });
  const eventMmsis = useMemo(() => (query.data?.data ?? []).map((e) => e.mmsi), [query.data]);
  // Since safety 0.2 events carry the vessel identity: only unnamed MMSIs are looked up.
  const eventNames = useMemo(() => {
    const merged = new Map(vesselNames);
    for (const event of query.data?.data ?? [])
      if (event.vessel?.name) merged.set(event.mmsi, event.vessel.name);
    return merged;
  }, [vesselNames, query.data]);
  const names = useVesselNames(eventMmsis, eventNames);

  // The API's message is English only: summarise from the detector data in the UI language.
  const eventSummary = useCallback(
    (event: SafetyEventDto) => {
      const facts = ewsEventFacts(event.data);
      if (!facts) return event.message;
      const distance = `${formatNumber(facts.distanceM, i18n.language, { maximumFractionDigits: 0 })} m`;
      const pipeline = facts.pipeline ?? t('events.unknownPipeline');
      if (facts.status === null || facts.thresholdM === null)
        return t('events.summary', { distance, pipeline });
      return t('events.summaryThreshold', {
        distance,
        pipeline,
        band: EWS_STATUS_LABELS[facts.status][locale].toLowerCase(),
        threshold: `${formatNumber(facts.thresholdM, i18n.language)} m`,
      });
    },
    [t, i18n.language, locale],
  );

  const columns = useMemo<ColumnDef<SafetyEventDto>[]>(
    () => [
      {
        id: 'time',
        header: t('events.time'),
        cell: ({ row }) => (
          <time dateTime={row.original.time} className="text-xs whitespace-nowrap">
            {formatDateTime(row.original.time, i18n.language)}
          </time>
        ),
      },
      {
        id: 'vessel',
        header: t('events.vessel'),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{names.get(row.original.mmsi) ?? '—'}</p>
            <MmsiText mmsi={row.original.mmsi} className="text-xs text-muted-foreground" />
          </div>
        ),
      },
      {
        id: 'severity',
        header: t('events.severity'),
        cell: ({ row }) => <SeverityBadge severity={row.original.currentSeverity} />,
      },
      {
        id: 'distance',
        header: t('events.distance'),
        cell: ({ row }) => {
          const value = row.original.data?.pipelineDistanceM;
          return typeof value === 'number' ? <UnitValue value={value} unit="m" /> : '—';
        },
        meta: { className: 'text-right' },
      },
      {
        id: 'status',
        header: t('events.status'),
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge variant={s === 'open' ? 'warning' : 'success'}>
              {s in SAFETY_EVENT_STATUS_LABELS ? SAFETY_EVENT_STATUS_LABELS[s][locale] : s}
            </Badge>
          );
        },
      },
      {
        id: 'message',
        header: t('events.message'),
        cell: ({ row }) => (
          <p
            className="line-clamp-2 max-w-[28rem] min-w-[12rem] text-xs whitespace-normal text-muted-foreground"
            title={row.original.message}
          >
            {eventSummary(row.original)}
          </p>
        ),
        meta: { className: 'hidden lg:table-cell' },
      },
      {
        id: 'alert',
        header: () => <span className="sr-only">{t('events.alert')}</span>,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-xs" asChild>
            <Link
              to={`/alerts?alert=${row.original.id}&status=all`}
              aria-label={t('events.openAlert', { title: row.original.title })}
              title={t('events.openAlertShort')}
            >
              <BellRing />
            </Link>
          </Button>
        ),
        meta: { className: 'w-[1%]', alwaysVisible: true },
      },
    ],
    [t, i18n.language, locale, names, eventSummary],
  );

  return (
    <section aria-labelledby="ews-events-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="ews-events-title" className="text-base font-semibold">
            {t('events.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('events.description')}</p>
        </div>
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(value) => value && setStatus(value as EventStatusFilter)}
          aria-label={t('events.statusFilter')}
        >
          {(['all', 'open', 'resolved'] as const).map((value) => (
            <ToggleGroupItem key={value} value={value} className="px-3">
              {t(`events.statuses.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <DataTable
        ariaLabel={t('events.title')}
        columns={columns}
        data={query.data?.data}
        loading={query.isPending}
        error={query.isError ? localizeProblem(query.error, safetyProblemCopies(t)) : undefined}
        onRetry={() => void query.refetch()}
        getRowId={(row) => row.id}
        density="compact"
        pagination={cursor.adapter(query.data?.page.nextCursor, query.isFetching)}
        emptyState={
          <EmptyState
            size="sm"
            icon={ShieldCheck}
            title={t('events.empty')}
            description={t('events.emptyDescription')}
          />
        }
      />
    </section>
  );
}

/** Pipeline Early Warning System (safety service, spec §13.7): vessels near pipelines. */
export function EwsPage() {
  const { t, i18n } = useTranslation('safety');
  const [searchParams, setSearchParams] = useSearchParams();
  const statuses = parseEwsStatusParam(searchParams.get('status'));
  const selectedMmsi = Number(searchParams.get('vessel')) || null;
  const canReadZones = usePermission('zone:read');

  const states = useVesselStatesControllerList(
    { ewsStatus: statuses.join(','), limit: STATE_LIMIT },
    { query: { placeholderData: keepPreviousData, refetchInterval: 30_000 } },
  );
  const detectors = useDetectorsControllerList({ query: { staleTime: 10 * 60_000 } });
  const pipelines = useZonesControllerGeojson(
    { kind: ['pipeline'] },
    { query: { enabled: canReadZones, staleTime: 5 * 60_000 }, request: ARRAY_PARAMS },
  );
  const thresholds = ewsThresholdsOf(detectors.data);
  const sorted = useMemo(() => sortEwsStates(states.data ?? []), [states.data]);
  const names = useMemo(() => pipelineNames(pipelines.data), [pipelines.data]);
  const vesselNames = useMemo(
    () =>
      new Map(sorted.flatMap((s) => (s.vessel?.name ? [[s.mmsi, s.vessel.name] as const] : []))),
    [sorted],
  );
  const counts = countByEwsStatus(sorted);
  const columns = useVesselColumns(names, selectedMmsi);

  const update = (patch: { status?: EwsStatus[]; vessel?: number | null }) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (patch.status) {
          const value = formatEwsStatusParam(patch.status);
          if (value) next.set('status', value);
          else next.delete('status');
        }
        if (patch.vessel !== undefined) {
          if (patch.vessel === null) next.delete('vessel');
          else next.set('vessel', String(patch.vessel));
        }
        return next;
      },
      { replace: true },
    );

  const truncated = (states.data?.length ?? 0) >= STATE_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.safety')}
        icon={Cable}
        title={t('ews.title')}
        description={t('ews.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void states.refetch()}
            disabled={states.isFetching}
          >
            <RefreshCw className={states.isFetching ? 'animate-spin' : ''} />{' '}
            {t('common:actions.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('ews.stats.danger')}
          value={statuses.includes(0) ? formatNumber(counts.danger, i18n.language) : '—'}
          icon={OctagonAlert}
          tone="danger"
          loading={states.isPending}
          methodId="ews.pipeline_distance_status"
          description={t('ews.stats.dangerHint', { meters: thresholds.dangerM })}
        />
        <StatCard
          label={t('ews.stats.warning')}
          value={statuses.includes(1) ? formatNumber(counts.warning, i18n.language) : '—'}
          icon={TriangleAlert}
          tone="warning"
          loading={states.isPending}
          methodId="ews.pipeline_distance_status"
          description={t('ews.stats.warningHint', { meters: thresholds.warningM })}
        />
        <StatCard
          label={t('ews.stats.pipelines')}
          value={canReadZones ? formatNumber(pipelines.data?.featureCount, i18n.language) : '—'}
          icon={Cable}
          tone="primary"
          loading={canReadZones && pipelines.isPending}
          description={
            canReadZones ? t('ews.stats.pipelinesHint') : t('ews.stats.pipelinesForbidden')
          }
        />
      </div>

      <section aria-labelledby="ews-vessels-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ews-vessels-title" className="text-base font-semibold">
              {t('ews.vessels.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('ews.vessels.description')}</p>
          </div>
          <ToggleGroup
            type="multiple"
            value={statuses.map(String)}
            onValueChange={(values) => {
              const next = values
                .map(Number)
                .filter((v): v is EwsStatus => v === 0 || v === 1 || v === 3);
              if (next.length) update({ status: next });
            }}
            aria-label={t('ews.vessels.filter')}
          >
            {EWS_FILTER_STATUSES.map((status) => (
              <ToggleGroupItem
                key={status}
                value={String(status)}
                className="px-3"
                data-testid={`ews-filter-${status}`}
              >
                <span
                  aria-hidden
                  className={
                    status === 0
                      ? 'size-2 rounded-full bg-danger'
                      : status === 1
                        ? 'size-2 rounded-full bg-warning'
                        : 'size-2 rounded-full bg-success'
                  }
                />
                {status === 0
                  ? t('ews.status.danger')
                  : status === 1
                    ? t('ews.status.warning')
                    : t('ews.status.safe')}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {pipelines.data?.truncated && (
          <Alert variant="warning">
            <AlertDescription>{t('ews.map.truncated')}</AlertDescription>
          </Alert>
        )}
        {truncated && (
          <Alert variant="info">
            <AlertDescription>
              {t('ews.vessels.truncated', { count: STATE_LIMIT })}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="order-2 min-w-0 xl:order-1">
            <DataTable
              ariaLabel={t('ews.vessels.title')}
              columns={columns}
              data={sorted}
              loading={states.isPending}
              error={
                states.isError ? localizeProblem(states.error, safetyProblemCopies(t)) : undefined
              }
              onRetry={() => void states.refetch()}
              getRowId={(row) => String(row.mmsi)}
              onRowClick={(row) => update({ vessel: row.mmsi === selectedMmsi ? null : row.mmsi })}
              pagination={{ mode: 'client', pageSize: 10 }}
              emptyState={
                <EmptyState
                  size="sm"
                  icon={ShieldCheck}
                  title={t('ews.vessels.empty')}
                  description={t('ews.vessels.emptyDescription')}
                />
              }
            />
          </div>
          <div className="order-1 h-[320px] min-w-0 overflow-hidden rounded-xl border shadow-xs sm:h-[420px] xl:order-2 xl:h-[560px]">
            {pipelines.isError && !pipelines.data ? (
              <ErrorState
                error={pipelines.error}
                onRetry={() => void pipelines.refetch()}
                size="sm"
                className="h-full"
              />
            ) : states.isPending && !states.data ? (
              <Skeleton className="size-full rounded-none" />
            ) : (
              <EwsMap
                className="size-full"
                pipelines={pipelines.data}
                states={sorted}
                thresholds={thresholds}
                selectedMmsi={selectedMmsi}
                onSelect={(mmsi) => update({ vessel: mmsi })}
              />
            )}
          </div>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <EwsEvents vesselNames={vesselNames} />
        <EwsRuleCard thresholds={thresholds} className="self-start" />
      </div>
    </div>
  );
}
