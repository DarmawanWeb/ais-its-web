import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, ScanSearch } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { SeverityBadge } from '@/shared/domain-ui/badges';
import { DataTable } from '@/shared/domain-ui/data-table';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  exportEvents,
  exportTranshipmentResults,
  useSurveillanceEvents,
  useTranshipmentResults,
  useZoneOverlay,
} from '../api/queries';
import { DurationText, EventStatusBadge, VesselCell } from '../components/bits';
import { DetectorEmptyState, DetectorRuleCard } from '../components/detector-rule';
import { EventsTable } from '../components/events-table';
import { ExportCsvButton } from '../components/export-button';
import { FiltersBar } from '../components/filters-bar';
import { ZoneContextLayer } from '../components/maps/layers';
import { MapPreview } from '../components/maps/map-preview';
import { SurveillanceNav } from '../components/surveillance-nav';
import { AccuracyMeter, PriorityDistributionBar } from '../components/transhipment-figures';
import { useDetectorThresholds } from '../hooks/use-detector';
import { useEventFilters } from '../hooks/use-event-filters';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { SurveillanceEvent, TranshipmentResult } from '../lib/dto';
import { readTranshipmentData } from '../lib/event-data';
import { exportFileName, toCsvRows } from '../lib/export';
import { activeFilterCount, eventQuery, rangeStart } from '../lib/filters';
import { withPosition } from '../lib/geo';

const PAGE_SIZE = 50;
const AREA_KINDS = ['transhipment_area'] as const;

function minutesBetween(from: string | undefined, to: string | undefined) {
  if (!from || !to) return undefined;
  return (Date.parse(to) - Date.parse(from)) / 60_000;
}

/**
 * Illegal transhipment (`/surveillance/transhipment`): the detector's events (with their review
 * status) and every positive analysis in the legacy result shape (accuracy, window, average
 * priority, priority distribution), with a map preview and CSV export. A row opens the pair
 * replay.
 */
export function TranshipmentPage() {
  const { t, i18n } = useTranslation('surveillance');
  const navigate = useNavigate();
  useSurveillanceLive();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'results' ? 'results' : 'events';
  const { filters, setFilters, resetFilters, anchor, cursor } = useEventFilters();
  const thresholds = useDetectorThresholds('transhipment');
  const threshold = thresholds.number('ACCURACY_THRESHOLD', 70);
  const critical = thresholds.number('CRITICAL_ACCURACY', 90);

  const eventsParams = eventQuery('transhipment', filters, anchor, {
    limit: PAGE_SIZE,
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  });
  const resultsParams = {
    from: rangeStart(filters.range, anchor),
    limit: PAGE_SIZE,
    ...(filters.mmsi !== null ? { mmsi: filters.mmsi } : {}),
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  };
  const events = useSurveillanceEvents(eventsParams, tab === 'events');
  const results = useTranshipmentResults(resultsParams, tab === 'results');
  const zones = useZoneOverlay(AREA_KINDS);
  const n = useCallback(
    (value: number | undefined, digits = 1) =>
      value === undefined
        ? '—'
        : formatNumber(value, i18n.language, { maximumFractionDigits: digits }),
    [i18n.language],
  );

  const openEvent = useCallback(
    (eventId: string) => void navigate(`/surveillance/transhipment/${eventId}`),
    [navigate],
  );

  const eventColumns = useMemo<ColumnDef<SurveillanceEvent>[]>(
    () => [
      {
        id: 'accuracy',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('fields.accuracy')} <MethodInfo methodId="transhipment.accuracy" />
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <AccuracyMeter
            value={readTranshipmentData(row.original.data).accuracy}
            threshold={threshold}
            critical={critical}
            size="sm"
          />
        ),
        meta: { className: 'min-w-40' },
      },
      {
        id: 'window',
        header: t('fields.duration'),
        enableSorting: false,
        cell: ({ row }) => {
          const data = readTranshipmentData(row.original.data);
          return <DurationText minutes={minutesBetween(data.startTimestamp, data.endTimestamp)} />;
        },
      },
    ],
    [t, threshold, critical],
  );

  const resultColumns = useMemo<ColumnDef<TranshipmentResult>[]>(
    () => [
      {
        id: 'window',
        header: t('fields.window'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col whitespace-nowrap">
            <span className="text-sm">
              {formatDateTime(row.original.startTimestamp, i18n.language)}
            </span>
            <span className="text-xs text-muted-foreground">
              <DurationText
                minutes={minutesBetween(row.original.startTimestamp, row.original.endTimestamp)}
              />
            </span>
          </span>
        ),
      },
      {
        id: 'pair',
        header: t('fields.pair'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex w-44 min-w-0 flex-col gap-1">
            <VesselCell mmsi={row.original.ship1MMSI} name={row.original.ship1Name} />
            <VesselCell mmsi={row.original.ship2MMSI} name={row.original.ship2Name} />
          </span>
        ),
      },
      {
        id: 'accuracy',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('fields.accuracy')} <MethodInfo methodId="transhipment.accuracy" />
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <AccuracyMeter
            value={row.original.accuracy}
            threshold={threshold}
            critical={critical}
            size="sm"
          />
        ),
        meta: { className: 'min-w-40' },
      },
      {
        id: 'averagePriority',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('fields.averagePriority')}{' '}
            <MethodInfo methodId="transhipment.priority_distribution" />
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{n(row.original.averagePriority, 2)}</span>
        ),
      },
      {
        id: 'distribution',
        header: t('fields.distribution'),
        enableSorting: false,
        cell: ({ row }) => (
          <PriorityDistributionBar distribution={row.original.priorityDistribution} compact />
        ),
        meta: { className: 'min-w-28' },
      },
      {
        id: 'severity',
        header: t('fields.severity'),
        enableSorting: false,
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
      {
        id: 'status',
        header: t('fields.status'),
        enableSorting: false,
        cell: ({ row }) => <EventStatusBadge status={row.original.status} />,
      },
    ],
    [t, i18n.language, threshold, critical, n],
  );

  const eventPoints = useMemo(
    () =>
      withPosition(events.data?.data ?? []).map((event) => ({
        id: event.id,
        lat: event.lat,
        lon: event.lon,
        severity: event.currentSeverity,
        active: event.resolvedAt === null,
        label: `${event.vesselName ?? event.mmsi} ↔ ${event.relatedVesselName ?? event.relatedMmsi ?? ''}`,
      })),
    [events.data],
  );
  const resultPoints = useMemo(
    () =>
      withPosition(results.data?.data ?? []).map((result) => ({
        id: result.eventId,
        lat: result.lat,
        lon: result.lon,
        severity: result.severity,
        active: result.status === 'open',
        label: `${result.ship1Name ?? result.ship1MMSI} ↔ ${result.ship2Name ?? result.ship2MMSI} · ${n(result.accuracy)} %`,
      })),
    [results.data, n],
  );

  const filtered = activeFilterCount(filters) > 0;
  const setTab = (value: string) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'results') next.set('tab', 'results');
        else next.delete('tab');
        return next;
      },
      { replace: true },
    );
    cursor.reset();
  };

  const exportCurrent = async () => {
    if (tab === 'results') {
      const { items, truncated } = await exportTranshipmentResults({
        ...resultsParams,
        cursor: undefined,
      });
      return {
        truncated,
        rows: toCsvRows(items, [
          { header: t('csv.resultId'), value: (row) => row.id },
          { header: t('csv.eventId'), value: (row) => row.eventId },
          { header: 'ship1MMSI', value: (row) => row.ship1MMSI },
          { header: t('csv.ship1Name'), value: (row) => row.ship1Name },
          { header: 'ship2MMSI', value: (row) => row.ship2MMSI },
          { header: t('csv.ship2Name'), value: (row) => row.ship2Name },
          { header: 'startTimestamp', value: (row) => row.startTimestamp },
          { header: 'endTimestamp', value: (row) => row.endTimestamp },
          { header: t('csv.accuracy'), value: (row) => row.accuracy },
          { header: t('csv.averagePriority'), value: (row) => row.averagePriority },
          { header: t('csv.low'), value: (row) => row.priorityDistribution.low },
          { header: t('csv.medium'), value: (row) => row.priorityDistribution.medium },
          { header: t('csv.high'), value: (row) => row.priorityDistribution.high },
          { header: t('csv.severity'), value: (row) => row.severity },
          { header: t('csv.status'), value: (row) => row.status },
          { header: t('csv.detectedAt'), value: (row) => row.detectedAt },
          { header: t('csv.lat'), value: (row) => row.lat },
          { header: t('csv.lon'), value: (row) => row.lon },
          { header: t('csv.methodId'), value: (row) => row.methodId },
        ]),
      };
    }
    const { items, truncated } = await exportEvents({ ...eventsParams, cursor: undefined });
    return {
      truncated,
      rows: toCsvRows(items, [
        { header: t('csv.eventId'), value: (row) => row.id },
        { header: t('csv.time'), value: (row) => row.time },
        { header: 'MMSI', value: (row) => row.mmsi },
        { header: t('csv.vesselName'), value: (row) => row.vesselName },
        { header: t('csv.relatedMmsi'), value: (row) => row.relatedMmsi },
        { header: t('csv.relatedVesselName'), value: (row) => row.relatedVesselName },
        { header: t('csv.accuracy'), value: (row) => readTranshipmentData(row.data).accuracy },
        { header: 'startTimestamp', value: (row) => readTranshipmentData(row.data).startTimestamp },
        { header: 'endTimestamp', value: (row) => readTranshipmentData(row.data).endTimestamp },
        { header: t('csv.severity'), value: (row) => row.currentSeverity },
        { header: t('csv.status'), value: (row) => row.status },
        { header: t('csv.note'), value: (row) => row.note },
        { header: t('csv.lat'), value: (row) => row.lat },
        { header: t('csv.lon'), value: (row) => row.lon },
        { header: t('csv.methodId'), value: (row) => row.methodId },
      ]),
    };
  };

  const map = (
    <MapPreview
      points={tab === 'results' ? resultPoints : eventPoints}
      onSelect={openEvent}
      fitKey={`${tab}:${filters.range}:${filters.severity}:${filters.status}:${filters.mmsi}:${cursor.pageIndex}`}
      ariaLabel={t('transhipment.mapLabel')}
      className="order-first 2xl:sticky 2xl:top-4 2xl:order-none"
    >
      <ZoneContextLayer collection={zones.data} />
    </MapPreview>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.surveillance')}
        title={t('transhipment.title')}
        description={t('transhipment.description')}
        icon={ArrowLeftRight}
        actions={
          <ExportCsvButton
            fileName={exportFileName(
              tab === 'results' ? 'transhipment-results' : 'transhipment-events',
            )}
            collect={exportCurrent}
          />
        }
      />
      <SurveillanceNav />
      <DetectorRuleCard type="transhipment" />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList aria-label={t('transhipment.tabs')}>
          <TabsTrigger value="events">{t('transhipment.tabEvents')}</TabsTrigger>
          <TabsTrigger value="results">{t('transhipment.tabResults')}</TabsTrigger>
        </TabsList>
        <FiltersBar
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          showSeverity={tab === 'events'}
          showStatus={tab === 'events'}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:items-start">
          <div className="min-w-0">
            <TabsContent value="events" className="mt-0">
              <EventsTable
                events={events.data?.data}
                loading={events.isPending}
                error={events.isError ? events.error : undefined}
                onRetry={() => void events.refetch()}
                pagination={cursor.adapter(events.data?.page.nextCursor ?? null, events.isFetching)}
                columns={eventColumns}
                onRowClick={(event) => openEvent(event.id)}
                showRelated
                ariaLabel={t('transhipment.tableLabel')}
                emptyState={
                  <DetectorEmptyState
                    type="transhipment"
                    filtered={filtered}
                    onReset={resetFilters}
                    icon={ArrowLeftRight}
                  />
                }
              />
            </TabsContent>
            <TabsContent value="results" className="mt-0">
              <DataTable
                columns={resultColumns}
                data={results.data?.data}
                loading={results.isPending}
                error={results.isError ? results.error : undefined}
                onRetry={() => void results.refetch()}
                getRowId={(result) => result.id}
                onRowClick={(result) => openEvent(result.eventId)}
                pagination={cursor.adapter(
                  results.data?.page.nextCursor ?? null,
                  results.isFetching,
                )}
                density="compact"
                ariaLabel={t('transhipment.resultsLabel')}
                emptyState={
                  <DetectorEmptyState
                    type="transhipment"
                    filtered={filtered}
                    onReset={resetFilters}
                    icon={ScanSearch}
                  />
                }
              />
            </TabsContent>
          </div>
          {map}
        </div>
      </Tabs>
    </div>
  );
}
