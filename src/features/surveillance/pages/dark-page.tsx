import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { ColumnDef } from '@tanstack/react-table';
import { Anchor, EyeOff, Gauge, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/shared/domain-ui/page-header';
import { UnitValue } from '@/shared/domain-ui/values';
import { useDeckLayers } from '@/shared/map';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';

import { exportEvents, useSurveillanceEvents, useZoneOverlay } from '../api/queries';
import { ColumnHeading, DurationText } from '../components/bits';
import { DetectorEmptyState, DetectorRuleCard } from '../components/detector-rule';
import { EventDetailSheet } from '../components/event-detail-sheet';
import { EventsTable } from '../components/events-table';
import { ExportCsvButton } from '../components/export-button';
import { FiltersBar } from '../components/filters-bar';
import { HarbourBandLayer, ZoneContextLayer } from '../components/maps/layers';
import { MapPreview } from '../components/maps/map-preview';
import { SurveillanceNav } from '../components/surveillance-nav';
import { useDetectorThresholds } from '../hooks/use-detector';
import { useEventFilters } from '../hooks/use-event-filters';
import { useSeverityLegend } from '../hooks/use-severity-legend';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { SurveillanceEvent } from '../lib/dto';
import { darkGapMinutes, readDarkData, readDarkResolution } from '../lib/event-data';
import { exportFileName, toCsvRows } from '../lib/export';
import { activeFilterCount, eventQuery } from '../lib/filters';
import type { LonLat } from '../lib/geo';
import { withPosition } from '../lib/geo';

const PAGE_SIZE = 50;
const HARBOUR_KINDS = ['port', 'anchorage'] as const;

interface Gap {
  id: string;
  from: LonLat;
  to: LonLat;
}

/** Line from the last known position to where the vessel reappeared (resolved gaps). */
function ReappearanceLayer({ gaps }: { gaps: readonly Gap[] }) {
  const layers = useMemo(
    () =>
      gaps.length === 0
        ? null
        : [
            new LineLayer<Gap>({
              id: 'dark-gap-lines',
              data: [...gaps],
              getSourcePosition: (gap) => gap.from,
              getTargetPosition: (gap) => gap.to,
              getColor: [148, 163, 184, 170],
              getWidth: 1.5,
            }),
            new ScatterplotLayer<Gap>({
              id: 'dark-gap-reappeared',
              data: [...gaps],
              getPosition: (gap) => gap.to,
              radiusUnits: 'pixels',
              getRadius: 4,
              stroked: true,
              filled: true,
              getFillColor: [74, 222, 128, 200],
              getLineColor: [255, 255, 255, 200],
              lineWidthUnits: 'pixels',
              getLineWidth: 1,
            }),
          ],
    [gaps],
  );
  useDeckLayers('dark-gaps', layers, { order: 55 });
  return null;
}

/**
 * Dark vessels (`/surveillance/dark`): AIS gaps with the last known position, the gap length
 * (still growing while the vessel stays silent) and the harbour rule, drawn on the map as a band
 * around the global port and anchorage zones.
 */
export function DarkPage() {
  const { t, i18n } = useTranslation('surveillance');
  useSurveillanceLive();
  const { filters, setFilters, resetFilters, anchor, cursor } = useEventFilters();
  const [selected, setSelected] = useState<SurveillanceEvent | null>(null);
  const thresholds = useDetectorThresholds('dark');
  const bandKm = thresholds.number('HARBOUR_DISTANCE_KM', 5);
  const gapMin = thresholds.number('GAP_MIN', 30);
  const minSog = thresholds.number('MIN_SOG_KN', 1);
  const severityLegend = useSeverityLegend();

  const params = eventQuery('dark', filters, anchor, {
    limit: PAGE_SIZE,
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  });
  const events = useSurveillanceEvents(params);
  const harbours = useZoneOverlay(HARBOUR_KINDS);
  const n = (value: number) => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });

  const columns = useMemo<ColumnDef<SurveillanceEvent>[]>(
    () => [
      {
        id: 'gap',
        header: () => (
          <ColumnHeading methodId="dark.ais_gap">{t('fields.gapDuration')}</ColumnHeading>
        ),
        enableSorting: false,
        cell: ({ row }) => <DurationText minutes={darkGapMinutes(row.original)} />,
      },
      {
        id: 'sog',
        header: t('fields.lastSog'),
        enableSorting: false,
        cell: ({ row }) => (
          <UnitValue value={readDarkData(row.original.data).lastSogKn} unit="knots" />
        ),
      },
      {
        id: 'harbour',
        header: () => <ColumnHeading>{t('fields.nearestHarbour')}</ColumnHeading>,
        enableSorting: false,
        cell: ({ row }) => {
          const meters = readDarkData(row.original.data).nearestHarbourM;
          return meters === null || meters === undefined ? (
            <span className="text-xs text-muted-foreground">{t('fields.noHarbour')}</span>
          ) : (
            <UnitValue value={meters / 1000} unit="km" digits={1} />
          );
        },
      },
      {
        id: 'state',
        header: t('fields.state'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.resolvedAt === null ? (
            <Badge variant="warning" className="gap-1">
              <EyeOff className="size-3" aria-hidden /> {t('dark.stillDark')}
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1">
              {t('dark.reappeared', {
                at: formatDateTime(row.original.resolvedAt, i18n.language, 'dd MMM HH:mm'),
              })}
            </Badge>
          ),
      },
    ],
    [t, i18n.language],
  );

  const points = useMemo(
    () =>
      withPosition(events.data?.data ?? []).map((event) => ({
        id: event.id,
        lat: event.lat,
        lon: event.lon,
        severity: event.currentSeverity,
        active: event.resolvedAt === null,
        label: `${event.vesselName ?? event.mmsi} · ${t('fields.lastSeenAt')}`,
      })),
    [events.data, t],
  );
  const gaps = useMemo<Gap[]>(
    () =>
      withPosition(events.data?.data ?? []).flatMap((event) => {
        if (event.resolvedAt === null) return [];
        const resolution = readDarkResolution(event.resolution);
        return typeof resolution.lat === 'number' && typeof resolution.lon === 'number'
          ? [
              {
                id: event.id,
                from: [event.lon, event.lat] as LonLat,
                to: [resolution.lon, resolution.lat] as LonLat,
              },
            ]
          : [];
      }),
    [events.data],
  );

  const filtered = activeFilterCount(filters) > 0;
  const exportCurrent = async () => {
    const { items, truncated } = await exportEvents({ ...params, cursor: undefined });
    return {
      truncated,
      rows: toCsvRows(items, [
        { header: t('csv.eventId'), value: (row) => row.id },
        { header: 'MMSI', value: (row) => row.mmsi },
        { header: t('csv.vesselName'), value: (row) => row.vesselName },
        { header: t('csv.lastSeenAt'), value: (row) => readDarkData(row.data).lastSeenAt },
        { header: t('csv.gapMin'), value: (row) => darkGapMinutes(row)?.toFixed(0) },
        { header: t('csv.lastSogKn'), value: (row) => readDarkData(row.data).lastSogKn },
        {
          header: t('csv.nearestHarbourM'),
          value: (row) => readDarkData(row.data).nearestHarbourM,
        },
        { header: t('csv.reappearedAt'), value: (row) => row.resolvedAt },
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
        title={t('dark.title')}
        description={t('dark.description')}
        icon={EyeOff}
        actions={
          <ExportCsvButton fileName={exportFileName('dark-vessels')} collect={exportCurrent} />
        }
      />
      <SurveillanceNav />
      <DetectorRuleCard type="dark">
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          <li className="flex items-center gap-2 rounded-lg border bg-surface/70 px-3 py-2 text-sm">
            <Timer className="size-4 shrink-0 text-primary" aria-hidden />
            {t('dark.ruleGap', { value: n(gapMin) })}
          </li>
          <li className="flex items-center gap-2 rounded-lg border bg-surface/70 px-3 py-2 text-sm">
            <Gauge className="size-4 shrink-0 text-primary" aria-hidden />
            {t('dark.ruleSog', { value: n(minSog) })}
          </li>
          <li className="flex items-center gap-2 rounded-lg border bg-surface/70 px-3 py-2 text-sm">
            <Anchor className="size-4 shrink-0 text-primary" aria-hidden />
            {t('dark.ruleHarbour', { value: n(bandKm) })}
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t('dark.ruleTenancy')}</p>
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
          ariaLabel={t('dark.tableLabel')}
          timeHeader={t('fields.lastSeenAt')}
          emptyState={
            <DetectorEmptyState
              type="dark"
              filtered={filtered}
              onReset={resetFilters}
              icon={EyeOff}
            />
          }
        />
        <MapPreview
          points={points}
          selectedId={selected?.id}
          onSelect={(id) => setSelected(events.data?.data.find((event) => event.id === id) ?? null)}
          fitKey={`dark:${filters.range}:${filters.severity}:${filters.status}:${filters.mmsi}:${cursor.pageIndex}`}
          ariaLabel={t('dark.mapLabel')}
          className="order-first 2xl:sticky 2xl:top-4 2xl:order-none"
          legend={[
            ...severityLegend,
            { label: t('map.legend.reappeared'), color: 'rgb(74, 222, 128)', shape: 'dot' },
            {
              label: t('map.legend.harbourBand', { value: n(bandKm) }),
              color: 'rgba(167, 139, 250, 0.6)',
              shape: 'square',
            },
          ]}
        >
          <HarbourBandLayer collection={harbours.data} bandM={bandKm * 1000} />
          <ZoneContextLayer collection={harbours.data} />
          <ReappearanceLayer gaps={gaps} />
        </MapPreview>
      </div>
      <EventDetailSheet
        event={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
