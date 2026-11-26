import { ZONE_KIND_LABELS, isZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import type { ColumnDef } from '@tanstack/react-table';
import { Fish, History, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import type { FishingViolationDto } from '@/shared/api/generated/surveillance/model';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { CoordinateText, UnitValue } from '@/shared/domain-ui/values';
import { formatNumber } from '@/shared/lib/format';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SimpleTooltip } from '@/shared/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  exportEvents,
  exportFishingViolations,
  useAllFishingViolations,
  useFishingViolations,
  useSurveillanceEvents,
  useSurveillanceHeatmap,
  useZoneOverlay,
} from '../api/queries';
import { ColumnHeading, DurationText } from '../components/bits';
import { DetectorEmptyState, DetectorRuleCard } from '../components/detector-rule';
import { EventDetailSheet } from '../components/event-detail-sheet';
import { EventsTable } from '../components/events-table';
import { ExportCsvButton } from '../components/export-button';
import { FiltersBar } from '../components/filters-bar';
import { HeatRampLegend } from '../components/maps/heat-legend';
import { HeatLayer, PointHeatLayer, ZoneContextLayer } from '../components/maps/layers';
import { MapPreview } from '../components/maps/map-preview';
import { SurveillanceNav } from '../components/surveillance-nav';
import { useEventFilters } from '../hooks/use-event-filters';
import { useHeatLegendItem } from '../hooks/use-heat-legend-item';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { SurveillanceEvent } from '../lib/dto';
import { readZoneEventData } from '../lib/event-data';
import { exportFileName, toCsvRows } from '../lib/export';
import { activeFilterCount, eventQuery, rangeStart } from '../lib/filters';
import { withPosition } from '../lib/geo';

const PAGE_SIZE = 50;
const FISHING_ZONE_KINDS = ['fishing_ground', 'restricted'] as const;
const ALL_YEARS = 'all';

/**
 * Illegal fishing (`/surveillance/fishing`): live loitering detections inside fishing grounds
 * and restricted zones with their density heatmap, and the historical apprehension dataset
 * (`GET /surveillance/fishing-violations`) as a table and a heat layer.
 */
export function FishingPage() {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  useSurveillanceLive();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'history' ? 'history' : 'events';
  const { filters, setFilters, resetFilters, anchor, cursor } = useEventFilters();
  const [selected, setSelected] = useState<SurveillanceEvent | null>(null);
  const heatLegendItem = useHeatLegendItem();

  const params = eventQuery('fishing', filters, anchor, {
    limit: PAGE_SIZE,
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  });
  const events = useSurveillanceEvents(params, tab === 'events');
  const heatmap = useSurveillanceHeatmap(
    { type: 'fishing', from: rangeStart(filters.range, anchor), cellKm: 5 },
    tab === 'events',
  );
  const zones = useZoneOverlay(FISHING_ZONE_KINDS);

  const yearParam = search.get('year');
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const pages = usePageState({ pageSize: 20 });
  const violations = useFishingViolations({
    page: pages.page,
    pageSize: pages.pageSize,
    ...(year ? { year } : {}),
  });
  const allViolations = useAllFishingViolations(year);
  const everyYear = useAllFishingViolations(undefined);
  const years = useMemo(
    () =>
      [...new Set((everyYear.data?.items ?? []).map((item) => item.year))].sort((a, b) => a - b),
    [everyYear.data],
  );

  const setParam = (key: string, value: string | null) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const eventColumns = useMemo<ColumnDef<SurveillanceEvent>[]>(
    () => [
      {
        id: 'zone',
        header: t('fields.zone'),
        enableSorting: false,
        cell: ({ row }) => {
          const data = readZoneEventData(row.original.data);
          return (
            <span className="flex w-48 min-w-0 flex-col">
              <span className="truncate" title={row.original.zoneName ?? data.zoneName}>
                {row.original.zoneName ?? data.zoneName ?? '—'}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {data.zoneKind && isZoneKind(data.zoneKind)
                  ? ZONE_KIND_LABELS[data.zoneKind][locale]
                  : ''}
              </span>
            </span>
          );
        },
      },
      {
        id: 'duration',
        header: () => (
          <ColumnHeading methodId="fishing.loitering">{t('fields.loiterDuration')}</ColumnHeading>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <DurationText minutes={readZoneEventData(row.original.data).durationMin} />
        ),
      },
      {
        id: 'sog',
        header: () => <ColumnHeading>{t('fields.meanSog')}</ColumnHeading>,
        enableSorting: false,
        cell: ({ row }) => (
          <UnitValue value={readZoneEventData(row.original.data).meanSogKn} unit="knots" />
        ),
      },
      {
        id: 'rate',
        header: () => <ColumnHeading>{t('fields.courseChangeRate')}</ColumnHeading>,
        enableSorting: false,
        cell: ({ row }) => {
          const rate = readZoneEventData(row.original.data).courseChangeRateDegPerMin;
          return rate === undefined ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="font-mono tabular-nums">
              {t('fields.degPerMin', {
                value: formatNumber(rate, i18n.language, { maximumFractionDigits: 1 }),
              })}
            </span>
          );
        },
      },
    ],
    [t, locale, i18n.language],
  );

  const violationColumns = useMemo<ColumnDef<FishingViolationDto>[]>(
    () => [
      {
        accessorKey: 'vesselName',
        header: t('fields.vesselName'),
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium">{row.original.vesselName}</span>,
      },
      { accessorKey: 'flagCountry', header: t('fields.flag'), enableSorting: false },
      {
        accessorKey: 'year',
        header: t('fields.year'),
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.year}</span>,
      },
      {
        accessorKey: 'violation',
        header: t('fields.violation'),
        enableSorting: false,
        meta: { className: 'min-w-48 max-w-72 whitespace-normal' },
      },
      {
        accessorKey: 'action',
        header: t('fields.action'),
        enableSorting: false,
        meta: { className: 'max-w-48 whitespace-normal' },
      },
      {
        id: 'position',
        header: t('fields.position'),
        enableSorting: false,
        cell: ({ row }) => <CoordinateText lat={row.original.lat} lon={row.original.lon} />,
      },
      {
        id: 'source',
        header: t('fields.source'),
        enableSorting: false,
        cell: ({ row }) => (
          <SimpleTooltip label={row.original.sourceNote}>
            <button
              type="button"
              className="inline-flex max-w-40 cursor-help items-center gap-1 truncate text-left text-xs text-muted-foreground"
            >
              <Info className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{row.original.source}</span>
            </button>
          </SimpleTooltip>
        ),
      },
    ],
    [t],
  );

  const eventPoints = useMemo(
    () =>
      withPosition(events.data?.data ?? []).map((event) => ({
        id: event.id,
        lat: event.lat,
        lon: event.lon,
        severity: event.currentSeverity,
        active: event.resolvedAt === null,
        label: `${event.vesselName ?? event.mmsi} · ${event.zoneName ?? ''}`,
      })),
    [events.data],
  );
  const violationPositions = useMemo(
    () => (allViolations.data?.items ?? []).map((item): [number, number] => [item.lon, item.lat]),
    [allViolations.data],
  );
  const violationPoints = useMemo(
    () =>
      (violations.data?.data ?? []).map((item) => ({
        id: item.id,
        lat: item.lat,
        lon: item.lon,
        severity: 'info',
        active: true,
        label: `${item.vesselName} (${item.flagCountry}, ${item.year})`,
      })),
    [violations.data],
  );

  const filtered = activeFilterCount(filters) > 0;
  const exportCurrent = async () => {
    if (tab === 'history') {
      const { items, truncated } = await exportFishingViolations(year ? { year } : {});
      return {
        truncated,
        rows: toCsvRows(items, [
          { header: 'id', value: (row) => row.id },
          { header: t('csv.vesselName'), value: (row) => row.vesselName },
          { header: t('csv.flag'), value: (row) => row.flagCountry },
          { header: t('csv.year'), value: (row) => row.year },
          { header: t('csv.violation'), value: (row) => row.violation },
          { header: t('csv.action'), value: (row) => row.action },
          { header: t('csv.lat'), value: (row) => row.lat },
          { header: t('csv.lon'), value: (row) => row.lon },
          { header: t('csv.source'), value: (row) => row.source },
          { header: t('csv.sourceNote'), value: (row) => row.sourceNote },
          { header: t('csv.methodId'), value: (row) => row.methodId },
        ]),
      };
    }
    const { items, truncated } = await exportEvents({ ...params, cursor: undefined });
    return {
      truncated,
      rows: toCsvRows(items, [
        { header: t('csv.eventId'), value: (row) => row.id },
        { header: t('csv.time'), value: (row) => row.time },
        { header: 'MMSI', value: (row) => row.mmsi },
        { header: t('csv.vesselName'), value: (row) => row.vesselName },
        {
          header: t('csv.zone'),
          value: (row) => row.zoneName ?? readZoneEventData(row.data).zoneName,
        },
        { header: t('csv.zoneKind'), value: (row) => readZoneEventData(row.data).zoneKind },
        { header: t('csv.durationMin'), value: (row) => readZoneEventData(row.data).durationMin },
        { header: t('csv.meanSogKn'), value: (row) => readZoneEventData(row.data).meanSogKn },
        {
          header: t('csv.courseChangeRate'),
          value: (row) => readZoneEventData(row.data).courseChangeRateDegPerMin,
        },
        { header: t('csv.severity'), value: (row) => row.currentSeverity },
        { header: t('csv.status'), value: (row) => row.status },
        { header: t('csv.lat'), value: (row) => row.lat },
        { header: t('csv.lon'), value: (row) => row.lon },
        { header: t('csv.methodId'), value: (row) => row.methodId },
      ]),
    };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.surveillance')}
        title={t('fishing.title')}
        description={t('fishing.description')}
        icon={Fish}
        actions={
          <ExportCsvButton
            fileName={exportFileName(tab === 'history' ? 'fishing-violations' : 'fishing-events')}
            collect={exportCurrent}
          />
        }
      />
      <SurveillanceNav />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParam('tab', value === 'history' ? 'history' : null);
          cursor.reset();
        }}
        className="gap-4"
      >
        <TabsList aria-label={t('fishing.tabs')}>
          <TabsTrigger value="events">
            <Fish /> {t('fishing.tabEvents')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> {t('fishing.tabHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-0 flex flex-col gap-4">
          <DetectorRuleCard type="fishing" />
          <FiltersBar filters={filters} onChange={setFilters} onReset={resetFilters} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:items-start">
            <EventsTable
              events={events.data?.data}
              loading={events.isPending}
              error={events.isError ? events.error : undefined}
              onRetry={() => void events.refetch()}
              pagination={cursor.adapter(events.data?.page.nextCursor ?? null, events.isFetching)}
              columns={eventColumns}
              onRowClick={setSelected}
              selectedId={selected?.id}
              ariaLabel={t('fishing.tableLabel')}
              emptyState={
                <DetectorEmptyState
                  type="fishing"
                  filtered={filtered}
                  onReset={resetFilters}
                  icon={Fish}
                />
              }
            />
            <div className="order-first flex min-w-0 flex-col gap-2 2xl:sticky 2xl:top-4 2xl:order-none">
              <MapPreview
                points={eventPoints}
                selectedId={selected?.id}
                onSelect={(id) =>
                  setSelected(events.data?.data.find((event) => event.id === id) ?? null)
                }
                fitKey={`fishing:${filters.range}:${filters.severity}:${filters.status}:${filters.mmsi}:${cursor.pageIndex}`}
                ariaLabel={t('fishing.mapLabel')}
                emptyHint={heatmap.data && heatmap.data.total > 0 ? null : undefined}
              >
                <ZoneContextLayer collection={zones.data} />
                <HeatLayer cells={heatmap.data?.cells ?? []} />
              </MapPreview>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {heatmap.data
                  ? t('fishing.heatmapNote', {
                      total: formatNumber(heatmap.data.total, i18n.language),
                      cell: formatNumber(heatmap.data.cellKm, i18n.language),
                    })
                  : t('fishing.heatmapLoading')}
                <HeatRampLegend className="ml-auto" />
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0 flex flex-col gap-4">
          <section
            className="rounded-xl border bg-surface p-4 shadow-xs"
            aria-labelledby="fishing-history-title"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="fishing-history-title"
                className="flex items-center gap-1.5 text-sm font-semibold"
              >
                {t('fishing.historyTitle')}{' '}
                <MethodInfo methodId="fishing.apprehensions_2015_2017" />
              </h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="fishing-year" className="text-xs text-muted-foreground">
                  {t('fields.year')}
                </Label>
                <Select
                  value={year ? String(year) : ALL_YEARS}
                  onValueChange={(value) => {
                    setParam('year', value === ALL_YEARS ? null : value);
                    pages.setPage(1);
                  }}
                >
                  <SelectTrigger id="fishing-year" size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_YEARS}>{t('filters.allYears')}</SelectItem>
                    {years.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {t('fishing.historyDescription')}
            </p>
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:items-start">
            <DataTable
              columns={violationColumns}
              data={violations.data?.data}
              loading={violations.isPending}
              error={violations.isError ? violations.error : undefined}
              onRetry={() => void violations.refetch()}
              getRowId={(row) => row.id}
              pagination={pages.adapter(violations.data?.meta)}
              density="compact"
              ariaLabel={t('fishing.historyLabel')}
              emptyState={
                <EmptyState
                  icon={History}
                  title={t('fishing.historyEmpty')}
                  description={t('fishing.historyEmptyHint')}
                  size="sm"
                />
              }
            />
            <div className="order-first flex min-w-0 flex-col gap-2 2xl:sticky 2xl:top-4 2xl:order-none">
              <MapPreview
                points={violationPoints}
                fitKey={`history:${year ?? 'all'}`}
                extraFitPoints={violationPositions}
                ariaLabel={t('fishing.historyMapLabel')}
                legend={[
                  { label: t('map.legend.violation'), color: 'rgb(56, 189, 248)', shape: 'dot' },
                  heatLegendItem,
                ]}
              >
                <PointHeatLayer points={violationPositions} />
              </MapPreview>
              <p className="text-xs text-muted-foreground">
                {t('fishing.historyMapNote', { count: allViolations.data?.items.length ?? 0 })}
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <EventDetailSheet
        event={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
