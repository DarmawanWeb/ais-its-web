import { ArrowUpRight, ClipboardPen, Download, Fuel, Gauge, Ship } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import {
  readingsControllerSeries,
  useReadingsControllerStatus,
  useReadingsControllerSummary,
} from '@/shared/api/generated/telemetry/readings/readings';
import { Can } from '@/shared/auth/guards';
import { DataTable } from '@/shared/domain-ui/data-table';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { downloadCsv } from '@/shared/lib/csv';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { SERIES_MAX_PAGES, useSeries, useTelemetryVessels } from '../api/telemetry';
import { DevicesCard } from '../components/devices-card';
import { ManualReadingDialog } from '../components/manual-reading-dialog';
import { MqttCard } from '../components/mqtt-card';
import { SeriesChart, SeriesLegend } from '../components/series-chart';
import { VesselPicker } from '../components/vessel-picker';
import { useReadingColumns } from '../hooks/use-reading-columns';
import { localizeProblem, problemSummary } from '@/shared/api/problem-copy';
import { telemetryProblemCopies } from '../lib/problems';
import {
  allowedBuckets,
  BUCKETS,
  effectiveBucket,
  isBucket,
  isPreset,
  presetToRange,
  RANGE_PRESETS,
  type RangePreset,
} from '../lib/range';
import { nowMs } from '@/shared/lib/clock';

const CSV_PAGE_LIMIT = 500;
const CSV_MAX_PAGES = 40;

/** Readings explorer: fleet telemetry state, per-vessel series, manual entry, devices, MQTT. */
export function TelemetryPage() {
  const { t, i18n } = useTranslation('telemetry');
  const [searchParams, setSearchParams] = useSearchParams();
  const copies = useMemo(() => telemetryProblemCopies(t), [t]);
  const vessels = useTelemetryVessels();
  const fleet = vessels.data?.data ?? [];

  const requestedMmsi = Number(searchParams.get('mmsi'));
  const mmsi = fleet.some((vessel) => vessel.mmsi === requestedMmsi)
    ? requestedMmsi
    : (fleet[0]?.mmsi ?? null);
  const selected = fleet.find((vessel) => vessel.mmsi === mmsi) ?? null;
  const presetParam = searchParams.get('range');
  const preset: RangePreset = isPreset(presetParam) ? presetParam : 'last7d';
  // The range is anchored to the hour when the preset was chosen, so query keys stay stable.
  const [anchor, setAnchor] = useState(() => Math.ceil(nowMs() / 60_000) * 60_000);
  const range = useMemo(() => presetToRange(preset, anchor), [preset, anchor]);
  const bucketParam = searchParams.get('bucket');
  const bucket = effectiveBucket(isBucket(bucketParam) ? bucketParam : null, range);
  const allowed = allowedBuckets(range);

  const set = (patch: Record<string, string | null>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const status = useReadingsControllerStatus(String(mmsi ?? 0), {
    query: { enabled: mmsi !== null, refetchInterval: 60_000 },
  });
  const summary = useReadingsControllerSummary(String(mmsi ?? 0), range, {
    query: { enabled: mmsi !== null },
  });
  const series = useSeries(mmsi, range, bucket);
  const columns = useReadingColumns(bucket);
  const tableRows = useMemo(() => [...series.points].reverse(), [series.points]);
  const [exporting, setExporting] = useState(false);
  const n = (value: number | null | undefined, digits = 2) =>
    formatNumber(value ?? null, i18n.language, { maximumFractionDigits: digits });

  const exportCsv = async () => {
    if (mmsi === null) return;
    setExporting(true);
    try {
      const rows = [];
      let cursor: string | null = null;
      for (let page = 0; page < CSV_MAX_PAGES; page += 1) {
        const result = await readingsControllerSeries(String(mmsi), {
          from: range.from,
          to: range.to,
          bucket,
          limit: CSV_PAGE_LIMIT,
          ...(cursor ? { cursor } : {}),
        });
        rows.push(...result.data);
        cursor = result.page.nextCursor;
        if (!cursor) break;
      }
      downloadCsv(
        `telemetri-${mmsi}-${bucket}-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
        rows.map((point) => ({
          time: point.time,
          periodStart: point.periodStart ?? '',
          fuelMeTon: point.fuelMeTon,
          fuelAeTon: point.fuelAeTon,
          totalFuelTon: point.totalFuelTon,
          readings: point.readings,
          source: point.source ?? '',
          deviceId: point.deviceId ?? '',
        })),
      );
      toast.success(t('export.done', { count: rows.length }));
      if (cursor) toast.warning(t('export.truncated', { count: rows.length }));
    } catch (error) {
      toast.error(t('export.failed'), { description: problemSummary(error, copies) });
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow={t('common:nav.sections.fleet')}
      title={t('telemetry.title')}
      description={t('telemetry.description')}
      icon={Fuel}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => void exportCsv()}
            disabled={mmsi === null || exporting || series.points.length === 0}
          >
            <Download /> {exporting ? t('export.running') : t('common:actions.exportCsv')}
          </Button>
          <Can permission="telemetry:write">
            <ManualReadingDialog
              vessels={fleet}
              selected={mmsi}
              trigger={(open) => (
                <Button onClick={open} disabled={fleet.length === 0}>
                  <ClipboardPen /> {t('manual.open')}
                </Button>
              )}
            />
          </Can>
        </>
      }
    />
  );

  if (vessels.error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-xl border bg-surface">
          <ErrorState
            error={localizeProblem(vessels.error, copies)}
            onRetry={() => void vessels.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <VesselPicker
            vessels={fleet}
            loading={vessels.isPending}
            selected={mmsi}
            onSelect={(value) => set({ mmsi: String(value) })}
          />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <div className="grid gap-2 xl:hidden">
            <Label htmlFor="telemetry-vessel">{t('vessels.choose')}</Label>
            <Select
              value={mmsi ? String(mmsi) : ''}
              onValueChange={(value) => set({ mmsi: value })}
            >
              <SelectTrigger id="telemetry-vessel" className="w-full">
                <SelectValue
                  placeholder={vessels.isPending ? t('vessels.loading') : t('vessels.choose')}
                />
              </SelectTrigger>
              <SelectContent>
                {fleet.map((vessel) => (
                  <SelectItem key={vessel.mmsi} value={String(vessel.mmsi)}>
                    {vessel.name} · {vessel.mmsi}
                    {vessel.active ? ` · ${t('status.active')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!vessels.isPending && fleet.length === 0 ? (
            <div className="rounded-xl border bg-surface">
              <EmptyState
                icon={Ship}
                title={t('vessels.empty')}
                description={t('vessels.emptyHint')}
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/vessels">{t('vessels.openFleet')}</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <section
                aria-labelledby="telemetry-vessel-title"
                className="flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2
                      id="telemetry-vessel-title"
                      className="text-lg font-semibold tracking-tight"
                    >
                      {selected ? selected.name : t('vessels.loading')}
                    </h2>
                    {selected && (
                      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono">{selected.mmsi}</span>
                        <Badge
                          variant={status.data?.active ? 'success' : 'muted'}
                          className="gap-1.5"
                        >
                          <span
                            className={
                              status.data?.active
                                ? 'size-1.5 rounded-full bg-success'
                                : 'size-1.5 rounded-full bg-muted-foreground'
                            }
                            aria-hidden
                          />
                          {status.data?.active ? t('status.active') : t('status.inactive')}
                        </Badge>
                        <MethodInfo methodId="fuel.method_selection" />
                        <span>
                          {status.data?.lastReadingAt
                            ? t('status.lastReading', {
                                time: formatRelativeTime(status.data.lastReadingAt, i18n.language),
                              })
                            : t('status.noReading')}
                        </span>
                      </p>
                    )}
                  </div>
                  {selected && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/vessels/${selected.mmsi}`}>
                        {t('vessels.detail')} <ArrowUpRight />
                      </Link>
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ToggleGroup
                    type="single"
                    value={preset}
                    onValueChange={(value) => {
                      if (!value) return;
                      setAnchor(Math.ceil(nowMs() / 60_000) * 60_000);
                      set({ range: value === 'last7d' ? null : value });
                    }}
                    aria-label={t('range.label')}
                    className="rounded-lg border bg-muted/40 p-0.5"
                  >
                    {RANGE_PRESETS.map((item) => (
                      <ToggleGroupItem key={item} value={item}>
                        {t(`range.${item}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <ToggleGroup
                    type="single"
                    value={bucket}
                    onValueChange={(value) => value && set({ bucket: value })}
                    aria-label={t('buckets.label')}
                    className="rounded-lg border bg-muted/40 p-0.5"
                  >
                    {BUCKETS.map((item) => (
                      <ToggleGroupItem
                        key={item}
                        value={item}
                        disabled={!allowed.includes(item)}
                        title={allowed.includes(item) ? undefined : t('buckets.tooLong')}
                      >
                        {t(`buckets.${item}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(range.from, i18n.language)} –{' '}
                    {formatDateTime(range.to, i18n.language)}
                  </span>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
                <StatCard
                  label={t('summary.total')}
                  value={n(summary.data?.totalFuelTon)}
                  unit="t"
                  loading={summary.isPending}
                  tone="primary"
                  methodId="telemetry.fuel_reading_usage"
                  description={t('summary.readings', { count: summary.data?.readings ?? 0 })}
                />
                <StatCard
                  label={t('summary.me')}
                  value={n(summary.data?.fuelMeTon)}
                  unit="t"
                  loading={summary.isPending}
                />
                <StatCard
                  label={t('summary.ae')}
                  value={n(summary.data?.fuelAeTon)}
                  unit="t"
                  loading={summary.isPending}
                />
                <StatCard
                  label={t('summary.last')}
                  value={
                    summary.data?.lastReadingAt
                      ? formatDateTime(summary.data.lastReadingAt, i18n.language, 'dd MMM HH:mm')
                      : '—'
                  }
                  loading={summary.isPending}
                  description={
                    summary.data?.firstReadingAt
                      ? t('summary.first', {
                          time: formatDateTime(
                            summary.data.firstReadingAt,
                            i18n.language,
                            'dd MMM HH:mm',
                          ),
                        })
                      : undefined
                  }
                />
              </div>

              <Section
                title={t('series.title')}
                description={t('series.description')}
                actions={<SeriesLegend />}
              >
                {series.query.isPending ? (
                  <Skeleton className="h-72 w-full" />
                ) : series.query.error ? (
                  <ErrorState
                    error={localizeProblem(series.query.error, copies)}
                    onRetry={() => void series.query.refetch()}
                    size="sm"
                  />
                ) : series.points.length === 0 ? (
                  <EmptyState
                    icon={Gauge}
                    size="sm"
                    title={t('series.empty')}
                    description={t('series.emptyHint')}
                  />
                ) : (
                  <SeriesChart points={series.points} bucket={bucket} />
                )}
                {series.truncated && (
                  <p className="mt-3 text-xs text-warning">
                    {t('series.truncated', { count: SERIES_MAX_PAGES * 500 })}
                  </p>
                )}
              </Section>

              <Section title={t('table.title')} description={t('table.description')}>
                <DataTable
                  ariaLabel={t('table.title')}
                  columns={columns}
                  data={tableRows}
                  loading={series.query.isPending}
                  density="compact"
                  pagination={{ mode: 'client', pageSize: 20 }}
                  getRowId={(point) => point.time}
                  emptyState={<EmptyState icon={Gauge} size="sm" title={t('series.empty')} />}
                />
              </Section>

              {selected && (
                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <DevicesCard mmsi={selected.mmsi} count={selected.devices} />
                  <MqttCard mmsi={selected.mmsi} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
