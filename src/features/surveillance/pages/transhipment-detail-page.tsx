import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, ArrowLeftRight, Gauge, Ship } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { SeverityBadge } from '@/shared/domain-ui/badges';
import { DataTable } from '@/shared/domain-ui/data-table';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { CoordinateText, UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useSurveillanceEvent, useTranshipmentResults } from '../api/queries';
import { DurationText, EventStatusBadge, VesselCell } from '../components/bits';
import { EventTimeline } from '../components/event-timeline';
import { PairReplay } from '../components/pair-replay';
import { ReviewPanel } from '../components/review-panel';
import { AccuracyMeter, PriorityDistributionBar } from '../components/transhipment-figures';
import { useDetectorThresholds } from '../hooks/use-detector';
import { useSurveillanceLive } from '../hooks/use-surveillance-live';
import type { TranshipmentResult } from '../lib/dto';
import { readTranshipmentData } from '../lib/event-data';
import { useEventText } from '../hooks/use-event-text';

const earliest = (times: readonly string[]) =>
  times.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
const latest = (times: readonly string[]) =>
  times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));

function BackLink() {
  const { t } = useTranslation('surveillance');
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/surveillance/transhipment">
        <ArrowLeft /> {t('transhipment.back')}
      </Link>
    </Button>
  );
}

/**
 * One transhipment occurrence (`/surveillance/transhipment/:eventId`): replay of both tracks,
 * the score with its threshold, the priority figures, every positive analysis of the
 * occurrence, the lifecycle and the review.
 */
export function TranshipmentDetailPage() {
  const { t, i18n } = useTranslation('surveillance');
  const { eventId } = useParams();
  useSurveillanceLive();
  const query = useSurveillanceEvent(eventId);
  const event = query.data;
  const eventText = useEventText();
  const [seek, setSeek] = useState<{ at: string; nonce: number } | null>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const thresholds = useDetectorThresholds('transhipment');
  const threshold = thresholds.number('ACCURACY_THRESHOLD', 70);
  const critical = thresholds.number('CRITICAL_ACCURACY', 90);
  const data = readTranshipmentData(event?.data);

  const resultsQuery = useTranshipmentResults(
    {
      mmsi: event?.mmsi ?? 0,
      from: new Date(Date.parse(event?.time ?? '1970-01-01') - 60_000).toISOString(),
      limit: 200,
    },
    !!event,
  );
  const results = useMemo(
    () => (resultsQuery.data?.data ?? []).filter((result) => result.eventId === event?.id),
    [resultsQuery.data, event?.id],
  );
  const n = (value: number | null | undefined, digits = 1) =>
    value === undefined || value === null
      ? '—'
      : formatNumber(value, i18n.language, { maximumFractionDigits: digits });

  const resultColumns = useMemo<ColumnDef<TranshipmentResult>[]>(
    () => [
      {
        id: 'window',
        header: t('fields.window'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDateTime(row.original.startTimestamp, i18n.language, 'dd MMM HH:mm')} –{' '}
            {formatDateTime(row.original.endTimestamp, i18n.language, 'HH:mm')}
          </span>
        ),
      },
      {
        id: 'accuracy',
        header: t('fields.accuracy'),
        enableSorting: false,
        cell: ({ row }) => (
          <AccuracyMeter
            value={row.original.accuracy}
            threshold={threshold}
            critical={critical}
            size="sm"
          />
        ),
        meta: { className: 'min-w-36' },
      },
      {
        id: 'distribution',
        header: t('fields.distribution'),
        enableSorting: false,
        cell: ({ row }) => (
          <PriorityDistributionBar distribution={row.original.priorityDistribution} compact />
        ),
        meta: { className: 'min-w-24' },
      },
      {
        id: 'detectedAt',
        header: t('fields.detectedAt'),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.detectedAt, i18n.language),
      },
      {
        id: 'severity',
        header: t('fields.severity'),
        enableSorting: false,
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
    ],
    [t, i18n.language, threshold, critical],
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        <BackLink />
        <h1 className="sr-only">{t('transhipment.detailTitle')}</h1>
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-[28rem] xl:col-span-2" />
          <Skeleton className="h-[28rem]" />
        </div>
      </div>
    );
  }
  if (query.isError || !event) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <h1 className="sr-only">{t('transhipment.detailTitle')}</h1>
        <Section>
          <ErrorState
            error={query.error}
            title={query.error?.status === 404 ? t('transhipment.notFound') : undefined}
            description={query.error?.status === 404 ? t('transhipment.notFoundHint') : undefined}
            onRetry={query.error?.status === 404 ? undefined : () => void query.refetch()}
          />
        </Section>
      </div>
    );
  }

  const nameA = event.vesselName ?? String(event.mmsi);
  const nameB = event.relatedVesselName ?? String(event.relatedMmsi ?? '—');
  // The replay covers the first analysed window and every later analysis of the occurrence.
  const windowStart = earliest([
    data.startTimestamp ?? event.time,
    ...results.map((r) => r.startTimestamp),
  ]);
  const windowEnd = latest([
    data.endTimestamp ?? event.lastSeenAt,
    ...results.map((r) => r.endTimestamp),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        eyebrow={t('transhipment.title')}
        title={t('transhipment.pairTitle', { a: nameA, b: nameB })}
        description={eventText.description(event)}
        icon={ArrowLeftRight}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={event.currentSeverity} />
            <EventStatusBadge status={event.status} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          {event.relatedMmsi !== null ? (
            <div ref={replayRef} className="scroll-mt-20">
              <PairReplay
                mmsi1={event.mmsi}
                mmsi2={event.relatedMmsi}
                names={[nameA, nameB]}
                windowStart={windowStart}
                windowEnd={windowEnd}
                seekTo={seek}
              />
            </div>
          ) : (
            <Section>
              <p className="text-sm text-muted-foreground">{t('replay.noPair')}</p>
            </Section>
          )}
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                {t('transhipment.analysesTitle')}{' '}
                <MethodInfo methodId="transhipment.sliding_window" />
              </span>
            }
            description={t('transhipment.analysesDescription')}
          >
            <DataTable
              columns={resultColumns}
              data={results}
              loading={resultsQuery.isPending}
              error={resultsQuery.isError ? resultsQuery.error : undefined}
              onRetry={() => void resultsQuery.refetch()}
              getRowId={(result) => result.id}
              onRowClick={
                event.relatedMmsi !== null
                  ? (result) => {
                      setSeek({ at: result.startTimestamp, nonce: Date.now() });
                      replayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  : undefined
              }
              density="compact"
              ariaLabel={t('transhipment.analysesTitle')}
              pagination={{ mode: 'client', pageSize: 10 }}
            />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="size-4 text-primary" aria-hidden /> {t('transhipment.scoreTitle')}
                <MethodInfo methodId="transhipment.accuracy" />
              </span>
            }
          >
            <div className="space-y-4">
              <AccuracyMeter value={data.accuracy} threshold={threshold} critical={critical} />
              <p className="text-xs text-muted-foreground">
                {t('transhipment.scoreHint', {
                  threshold: n(threshold, 0),
                  critical: n(critical, 0),
                })}
              </p>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {t('fields.distribution')}{' '}
                  <MethodInfo methodId="transhipment.priority_distribution" />
                </p>
                <PriorityDistributionBar distribution={data.priorityDistribution} />
              </div>
              <KeyValueList
                columns={2}
                dense
                items={[
                  {
                    key: 'avg',
                    label: t('fields.averagePriority'),
                    hint: <MethodInfo methodId="transhipment.priority_distribution" />,
                    value: n(data.averagePriority, 2),
                    mono: true,
                  },
                  {
                    key: 'acc',
                    label: t('fields.accumulatedPriority'),
                    hint: <MethodInfo methodId="transhipment.candidate_queue" />,
                    value: n(data.accumulatedPriority, 0),
                    mono: true,
                  },
                  {
                    key: 'obs',
                    label: t('fields.observations'),
                    value: n(data.observations, 0),
                    mono: true,
                  },
                  {
                    key: 'dist',
                    label: t('fields.lastDistance'),
                    hint: <MethodInfo methodId="transhipment.location_priority" />,
                    value: <UnitValue value={data.lastDistanceM} unit="m" />,
                  },
                  {
                    key: 'points',
                    label: t('fields.routePoints'),
                    hint: <MethodInfo methodId="transhipment.route_interpolation" />,
                    value: `${n(data.route1Points, 0)} / ${n(data.route2Points, 0)}`,
                    mono: true,
                  },
                  {
                    key: 'window',
                    label: t('fields.duration'),
                    value: (
                      <DurationText
                        minutes={(Date.parse(windowEnd) - Date.parse(windowStart)) / 60_000}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </Section>

          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <Ship className="size-4 text-primary" aria-hidden />{' '}
                {t('transhipment.vesselsTitle')}
              </span>
            }
          >
            <div className="space-y-3">
              <VesselCell mmsi={event.mmsi} name={event.vesselName} />
              <VesselCell mmsi={event.relatedMmsi} name={event.relatedVesselName} />
              {event.lat !== null && event.lon !== null && (
                <p className="text-xs text-muted-foreground">
                  {t('transhipment.midpoint')}{' '}
                  <CoordinateText lat={event.lat} lon={event.lon} copyable />
                </p>
              )}
              {event.zoneName && (
                <p className="text-xs text-muted-foreground">
                  {t('transhipment.inZone', { zone: event.zoneName })}
                </p>
              )}
            </div>
          </Section>

          <Section>
            <ReviewPanel key={`${event.id}:${event.reviewedAt ?? ''}`} event={event} />
          </Section>

          <Section title={t('timeline.title')}>
            <EventTimeline event={event} results={results} />
          </Section>
        </div>
      </div>
    </div>
  );
}
