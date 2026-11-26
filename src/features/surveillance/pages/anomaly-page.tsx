import { PREDICTED_NAV_STATUS_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, EqualNot } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NavstatusLabel } from '@/shared/domain-ui/badges';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { UnitValue } from '@/shared/domain-ui/values';
import { cn } from '@/shared/lib/utils';

import { exportEvents, useSurveillanceEvents } from '../api/queries';
import { ColumnHeading } from '../components/bits';
import { DetectorEmptyState, DetectorRuleCard } from '../components/detector-rule';
import { EventDetailSheet } from '../components/event-detail-sheet';
import { EventsTable } from '../components/events-table';
import { ExportCsvButton } from '../components/export-button';
import { FiltersBar } from '../components/filters-bar';
import { MapPreview } from '../components/maps/map-preview';
import { SurveillanceNav } from '../components/surveillance-nav';
import { useDetectorThresholds } from '../hooks/use-detector';
import { useEventFilters } from '../hooks/use-event-filters';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { SurveillanceEvent } from '../lib/dto';
import { readAnomalyData } from '../lib/event-data';
import { exportFileName, toCsvRows } from '../lib/export';
import { activeFilterCount, eventQuery } from '../lib/filters';
import { withPosition } from '../lib/geo';

const PAGE_SIZE = 50;

/** Consecutive mismatching positions out of the persistence threshold, as dots + text. */
function Streak({ streak, min }: { streak: number | undefined; min: number }) {
  const { t } = useTranslation('surveillance');
  const value = streak ?? 0;
  const dots = Math.max(min, Math.min(value, 6));
  return (
    <span
      className="inline-flex items-center gap-2"
      title={t('fields.streakValue', { streak: value, min })}
    >
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: dots }, (_, index) => (
          <span
            key={index}
            className={cn('size-2 rounded-full', index < value ? 'bg-warning' : 'bg-muted')}
          />
        ))}
      </span>
      <span className="font-mono text-xs tabular-nums">
        {value}/{min}
      </span>
    </span>
  );
}

/**
 * Navigational status anomalies (`/surveillance/anomaly`): the reported AIS navigational status
 * against the status predicted from the vessel's motion, sustained for consecutive positions.
 */
export function AnomalyPage() {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  useSurveillanceLive();
  const { filters, setFilters, resetFilters, anchor, cursor } = useEventFilters();
  const [selected, setSelected] = useState<SurveillanceEvent | null>(null);
  const thresholds = useDetectorThresholds('anomaly');
  const minPositions = thresholds.number('MIN_POSITIONS', 3);

  const params = eventQuery('anomaly', filters, anchor, {
    limit: PAGE_SIZE,
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  });
  const events = useSurveillanceEvents(params);

  const columns = useMemo<ColumnDef<SurveillanceEvent>[]>(
    () => [
      {
        id: 'reported',
        header: () => <ColumnHeading>{t('fields.reportedNavstatus')}</ColumnHeading>,
        enableSorting: false,
        cell: ({ row }) => (
          <NavstatusLabel
            code={readAnomalyData(row.original.data).navstatus}
            showCode
            className="w-44 [&>span]:whitespace-normal"
          />
        ),
      },
      {
        id: 'predicted',
        header: () => (
          <ColumnHeading methodId="anomaly.navstatus_mismatch">
            {t('fields.predictedNavstatus')}
          </ColumnHeading>
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const predicted = readAnomalyData(row.original.data).predictedNavstatus;
          return (
            <span className="flex w-44 items-start gap-1.5 whitespace-normal">
              <EqualNot className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="sr-only">{t('anomaly.mismatch')}:</span>
              {predicted === undefined ? '—' : PREDICTED_NAV_STATUS_LABELS[predicted][locale]}
            </span>
          );
        },
      },
      {
        id: 'streak',
        header: () => <ColumnHeading>{t('fields.streak')}</ColumnHeading>,
        enableSorting: false,
        cell: ({ row }) => {
          const data = readAnomalyData(row.original.data);
          return <Streak streak={data.streak} min={data.minPositions ?? minPositions} />;
        },
      },
      {
        id: 'sog',
        header: t('fields.sog'),
        enableSorting: false,
        cell: ({ row }) => (
          <UnitValue value={readAnomalyData(row.original.data).sogKn} unit="knots" />
        ),
      },
    ],
    [t, locale, minPositions],
  );

  const points = useMemo(
    () =>
      withPosition(events.data?.data ?? []).map((event) => ({
        id: event.id,
        lat: event.lat,
        lon: event.lon,
        severity: event.currentSeverity,
        active: event.resolvedAt === null,
        label: `${event.vesselName ?? event.mmsi}`,
      })),
    [events.data],
  );

  const filtered = activeFilterCount(filters) > 0;
  const exportCurrent = async () => {
    const { items, truncated } = await exportEvents({ ...params, cursor: undefined });
    return {
      truncated,
      rows: toCsvRows(items, [
        { header: t('csv.eventId'), value: (row) => row.id },
        { header: t('csv.time'), value: (row) => row.time },
        { header: 'MMSI', value: (row) => row.mmsi },
        { header: t('csv.vesselName'), value: (row) => row.vesselName },
        { header: t('csv.navstatus'), value: (row) => readAnomalyData(row.data).navstatus },
        {
          header: t('csv.predictedNavstatus'),
          value: (row) => readAnomalyData(row.data).predictedNavstatus,
        },
        { header: t('csv.streak'), value: (row) => readAnomalyData(row.data).streak },
        { header: t('csv.sogKn'), value: (row) => readAnomalyData(row.data).sogKn },
        { header: t('csv.endedAt'), value: (row) => row.resolvedAt },
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
        title={t('anomaly.title')}
        description={t('anomaly.description')}
        icon={Activity}
        actions={
          <ExportCsvButton
            fileName={exportFileName('navstatus-anomalies')}
            collect={exportCurrent}
          />
        }
      />
      <SurveillanceNav />
      <DetectorRuleCard type="anomaly">
        {/* Wraps on narrow screens instead of scrolling inside its box. */}
        <p className="mt-3 rounded-lg border bg-surface/70 px-3 py-2 font-mono text-xs leading-relaxed break-words">
          {t('anomaly.formula')}
        </p>
      </DetectorRuleCard>
      <FiltersBar filters={filters} onChange={setFilters} onReset={resetFilters} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:items-start">
        <EventsTable
          events={events.data?.data}
          loading={events.isPending}
          error={events.isError ? events.error : undefined}
          onRetry={() => void events.refetch()}
          pagination={cursor.adapter(events.data?.page.nextCursor ?? null, events.isFetching)}
          columns={columns}
          onRowClick={setSelected}
          selectedId={selected?.id}
          ariaLabel={t('anomaly.tableLabel')}
          emptyState={
            <DetectorEmptyState
              type="anomaly"
              filtered={filtered}
              onReset={resetFilters}
              icon={Activity}
            />
          }
        />
        <MapPreview
          points={points}
          selectedId={selected?.id}
          onSelect={(id) => setSelected(events.data?.data.find((event) => event.id === id) ?? null)}
          fitKey={`anomaly:${filters.range}:${filters.severity}:${filters.status}:${filters.mmsi}:${cursor.pageIndex}`}
          ariaLabel={t('anomaly.mapLabel')}
          className="order-first 2xl:sticky 2xl:top-4 2xl:order-none"
        />
      </div>
      <EventDetailSheet
        event={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
