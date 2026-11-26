import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, CloudOff, Wind } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SegmentDto } from '@/shared/api/generated/emission/model';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { DataTable, useCursorState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { NavstatusLabel } from '@/shared/domain-ui/badges';
import { Section } from '@/shared/domain-ui/section';
import { Badge } from '@/shared/ui/badge';
import { DateRangePicker, presetRange, type DateRange } from '@/shared/ui/date-range-picker';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import { useVesselSegments } from '../api/queries';
import { useCiiFormat } from '../hooks/use-cii-format';
import {
  clampSegmentRange,
  KNOWN_SEGMENT_FLAGS,
  segmentMinutes,
  segmentsUseWeather,
} from '../lib/segments';
import { CiiProblemState, FuelMethodBadge } from './bits';

function FlagChips({ flags }: { flags: readonly string[] }) {
  const { t } = useTranslation('cii');
  if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => {
        const known = (KNOWN_SEGMENT_FLAGS as readonly string[]).includes(flag);
        return (
          <SimpleTooltip key={flag} label={known ? t(`flags.${flag}.hint`) : flag}>
            <Badge
              variant={flag === 'telemetry_reattributed' ? 'info' : 'warning'}
              className="cursor-help"
              tabIndex={0}
            >
              {known ? t(`flags.${flag}.label`) : flag}
            </Badge>
          </SimpleTooltip>
        );
      })}
    </span>
  );
}

/** Voyage segments (cursor pages, newest first) with the fuel method and weather per segment. */
export function SegmentsPanel({ mmsi }: { mmsi: number }) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const [range, setRange] = useState<DateRange | undefined>(() => presetRange('last24h'));
  const cursor = useCursorState();
  const params = useMemo(() => {
    const to = range?.to ?? new Date();
    const from = range?.from ?? new Date(to.getTime() - 24 * 3_600_000);
    const clamped = clampSegmentRange(from, to);
    return {
      from: clamped.from.toISOString(),
      to: clamped.to.toISOString(),
      limit: 50,
      ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
    };
  }, [range, cursor.cursor]);
  const query = useVesselSegments(mmsi, params);
  const segments = query.data?.data;

  const columns = useMemo<ColumnDef<SegmentDto>[]>(
    () => [
      {
        id: 'time',
        header: t('segments.time'),
        meta: { label: t('segments.time'), alwaysVisible: true },
        cell: ({ row }) => (
          <span className="flex flex-col whitespace-nowrap">
            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
              {format.dateTime(row.original.timeStart)}
              <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
              {format.time(row.original.timeEnd)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t('segments.minutes', { count: Math.round(segmentMinutes(row.original)) })}
            </span>
          </span>
        ),
      },
      {
        id: 'distance',
        header: t('segments.distance'),
        meta: { label: t('segments.distance'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {format.number(row.original.distanceNm, 2)}
          </span>
        ),
      },
      {
        id: 'speed',
        header: t('segments.speed'),
        meta: { label: t('segments.speed'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.number(row.original.speedKn, 1)}</span>
        ),
      },
      {
        id: 'fuel',
        header: t('segments.fuel'),
        meta: { label: t('segments.fuel'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="flex flex-col font-mono text-xs tabular-nums">
            <span>ME {format.fixed(row.original.fuelMeTon, 3)}</span>
            <span className="text-muted-foreground">
              AE {format.fixed(row.original.fuelAeTon, 3)}
            </span>
          </span>
        ),
      },
      {
        id: 'co2',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('segments.co2')} <MethodInfo methodId="emission.co2_conversion" />
          </span>
        ),
        meta: { label: t('segments.co2'), className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.fixed(row.original.co2Ton, 3)}</span>
        ),
      },
      {
        id: 'method',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('segments.method')} <MethodInfo methodId="fuel.method_selection" />
          </span>
        ),
        meta: { label: t('segments.method') },
        cell: ({ row }) => <FuelMethodBadge method={row.original.method} />,
      },
      {
        id: 'navstatus',
        header: t('segments.navstatus'),
        meta: { label: t('segments.navstatus') },
        cell: ({ row }) => (
          <NavstatusLabel code={row.original.navstatus} className="max-w-40 text-xs" />
        ),
      },
      {
        id: 'weather',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('segments.weather')} <MethodInfo methodId="weather.open_meteo_current" />
          </span>
        ),
        meta: { label: t('segments.weather') },
        cell: ({ row }) => {
          const weather = row.original.weather;
          if (!weather) return <span className="text-muted-foreground">—</span>;
          if (weather.source === 'calm_fallback') {
            return (
              <span className="inline-flex items-center gap-1 text-xs text-warning">
                <CloudOff className="size-3.5" aria-hidden /> {t('segments.calmFallback')}
              </span>
            );
          }
          return (
            <span className="flex flex-col text-xs whitespace-nowrap">
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Wind className="size-3.5 text-muted-foreground" aria-hidden />
                {format.number(weather.windSpeedKn, 1)} kn ·{' '}
                {format.number(weather.windDirectionDeg)}°
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('segments.beaufort', { value: weather.beaufortNumber })} ·{' '}
                {t('segments.encounter', { value: format.number(weather.encounterAngleDeg) })}
              </span>
            </span>
          );
        },
      },
      {
        id: 'flags',
        header: t('segments.flags'),
        meta: { label: t('segments.flags') },
        cell: ({ row }) => <FlagChips flags={row.original.flags} />,
      },
    ],
    [t, format],
  );

  return (
    <Section
      title={t('segments.title')}
      description={t('segments.description')}
      className="min-w-0"
      contentClassName="min-w-0"
    >
      <div className="flex flex-col gap-3">
        <DataTable
          columns={columns}
          data={segments}
          loading={query.isPending}
          error={query.isError ? query.error : undefined}
          onRetry={() => void query.refetch()}
          getRowId={(row) => `${row.mmsi}-${row.timeStart}`}
          pagination={cursor.adapter(query.data?.page.nextCursor ?? null, query.isFetching)}
          density="compact"
          enableColumnVisibility
          ariaLabel={t('segments.tableLabel')}
          toolbar={
            <div className="min-w-0">
              <DateRangePicker
                value={range}
                onChange={(next) => {
                  setRange(next);
                  cursor.reset();
                }}
                presets={['last24h', 'last7d', 'last30d']}
                label={t('segments.range')}
              />
            </div>
          }
          emptyState={
            query.isError ? (
              <CiiProblemState error={query.error} size="sm" />
            ) : (
              <EmptyState
                size="sm"
                title={t('segments.emptyTitle')}
                description={t('segments.emptyDescription')}
              />
            )
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>{t('segments.note')}</p>
          {segmentsUseWeather(segments) && <DataAttribution />}
        </div>
      </div>
    </Section>
  );
}
