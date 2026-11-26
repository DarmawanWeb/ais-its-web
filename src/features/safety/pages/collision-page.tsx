import { keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FilterX, Radar, RefreshCw, ShieldCheck, Ship, TriangleAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useDetectorsControllerList } from '@/shared/api/generated/safety/detectors/detectors';
import { useEncountersControllerList } from '@/shared/api/generated/safety/encounters/encounters';
import type { EncounterDto } from '@/shared/api/generated/safety/model';
import { useVesselStatesControllerList } from '@/shared/api/generated/safety/vessels/vessels';
import { CollisionRiskBadge } from '@/shared/domain-ui/badges';
import { useCursorState } from '@/shared/domain-ui/data-table/adapters';
import { DataTable } from '@/shared/domain-ui/data-table/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { EncounterDetailSheet } from '../components/encounter-detail-sheet';
import { RiskBandLegend } from '../components/risk-band-legend';
import { useVesselNames } from '../hooks/use-vessel-names';
import {
  closestSample,
  ENCOUNTER_RANGES,
  encounterDurationMin,
  type EncounterRange,
  isEncounterActive,
  rangeStart,
} from '../lib/encounters';
import { localizeProblem } from '@/shared/api/problem-copy';
import { safetyProblemCopies } from '../lib/problems';
import { collisionThresholdsOf } from '../lib/thresholds';

const RISKS = ['high', 'medium', 'low'] as const;
type Risk = (typeof RISKS)[number];
const PAGE_SIZE = 20;

function parseRisks(value: string | null): Risk[] {
  const risks = (value ?? '')
    .split(',')
    .filter((r): r is Risk => (RISKS as readonly string[]).includes(r));
  return risks.length ? risks : [...RISKS];
}

function parseRange(value: string | null): EncounterRange {
  return value && value in ENCOUNTER_RANGES ? (value as EncounterRange) : '24h';
}

const asRisk = (value: string) =>
  value === 'none' || value === 'low' || value === 'medium' || value === 'high' ? value : null;

function MmsiInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const { t } = useTranslation('safety');
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 400);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== debounced) setText(value);
  }
  const commit = useEffectEvent((next: string) => {
    if (next !== value) onCommit(next);
  });
  useEffect(() => commit(debounced), [debounced]);
  return (
    <div>
      <Label htmlFor="collision-mmsi" className="sr-only">
        {t('collision.filters.mmsi')}
      </Label>
      <Input
        id="collision-mmsi"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('collision.filters.mmsiPlaceholder')}
        value={text}
        onChange={(event) => setText(event.target.value.replace(/\D/g, '').slice(0, 9))}
        className="h-8 w-full font-mono text-sm sm:w-44"
      />
    </div>
  );
}

/** Collision risk (safety service, spec §13.7): encounters with peak risk, CPA and TCPA. */
export function CollisionPage() {
  const { t, i18n } = useTranslation('safety');
  const [searchParams, setSearchParams] = useSearchParams();
  const risks = parseRisks(searchParams.get('risk'));
  const range = parseRange(searchParams.get('range'));
  const mmsi = /^\d{9}$/.test(searchParams.get('mmsi') ?? '')
    ? (searchParams.get('mmsi') as string)
    : '';
  const selectedId = searchParams.get('encounter');
  const cursor = useCursorState();
  const { reset } = cursor;
  // `from` is fixed when the range changes (the cursor keeps the window of the first page).
  const [timeWindow, setTimeWindow] = useState(() => ({ range, from: rangeStart(range) }));
  if (timeWindow.range !== range) setTimeWindow({ range, from: rangeStart(range) });
  const filterKey = `${risks.join(',')}|${timeWindow.from}|${mmsi}`;
  useEffect(() => reset(), [filterKey, reset]);

  const update = (patch: Record<string, string | null>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: !('encounter' in patch) },
    );

  const params = {
    from: timeWindow.from,
    limit: PAGE_SIZE,
    ...(risks.length < RISKS.length ? { risk: risks.join(',') } : {}),
    ...(mmsi ? { mmsi: Number(mmsi) } : {}),
    ...(cursor.cursor ? { cursor: cursor.cursor } : {}),
  };
  const list = useEncountersControllerList(params, {
    query: { placeholderData: keepPreviousData },
  });
  const detectors = useDetectorsControllerList({ query: { staleTime: 10 * 60_000 } });
  const thresholds = collisionThresholdsOf(detectors.data);
  // Vessels in a medium/high band now: the live pair counts and the first source of names.
  const atRisk = useVesselStatesControllerList(
    { collisionRisk: 'medium,high', limit: 2_000 },
    { query: { refetchInterval: 30_000, staleTime: 15_000 } },
  );
  const knownNames = useMemo(
    () =>
      new Map(
        (atRisk.data ?? []).flatMap((state) =>
          state.vessel?.name ? [[state.mmsi, state.vessel.name] as const] : [],
        ),
      ),
    [atRisk.data],
  );
  const livePairs = useMemo(() => {
    const pairs = new Map<string, 'high' | 'medium'>();
    for (const state of atRisk.data ?? []) {
      const other = state.closestEncounter?.otherMmsi;
      if (!other || (state.collisionRisk !== 'high' && state.collisionRisk !== 'medium')) continue;
      const key = [Math.min(state.mmsi, other), Math.max(state.mmsi, other)].join(':');
      if (pairs.get(key) !== 'high') pairs.set(key, state.collisionRisk);
    }
    const values = [...pairs.values()];
    return {
      high: values.filter((v) => v === 'high').length,
      medium: values.filter((v) => v === 'medium').length,
    };
  }, [atRisk.data]);

  const inPage = list.data?.data.find((encounter) => encounter.encounterId === selectedId) ?? null;
  const single = useEncountersControllerList(
    { encounterId: selectedId ?? undefined, from: rangeStart('31d'), limit: 1 },
    { query: { enabled: !!selectedId && !inPage && !list.isPending } },
  );
  const selected = inPage ?? single.data?.data[0] ?? null;
  // The encounters carry MMSIs only: names of the page's pairs (and the opened one) are resolved.
  const pageMmsis = useMemo(
    () =>
      [...(list.data?.data ?? []), ...(selected ? [selected] : [])].flatMap((encounter) => [
        encounter.mmsiA,
        encounter.mmsiB,
      ]),
    [list.data, selected],
  );
  // Since safety 0.2 the encounters carry vesselA / vesselB: only unnamed MMSIs are looked up.
  const pairNames = useMemo(() => {
    const merged = new Map(knownNames);
    for (const encounter of [...(list.data?.data ?? []), ...(selected ? [selected] : [])]) {
      if (encounter.vesselA?.name) merged.set(encounter.mmsiA, encounter.vesselA.name);
      if (encounter.vesselB?.name) merged.set(encounter.mmsiB, encounter.vesselB.name);
    }
    return merged;
  }, [knownNames, list.data, selected]);
  const names = useVesselNames(pageMmsis, pairNames);

  const columns = useMemo<ColumnDef<EncounterDto>[]>(
    () => [
      {
        id: 'pair',
        header: t('collision.table.pair'),
        cell: ({ row }) => (
          <div className="min-w-[12rem] space-y-0.5">
            {(['mmsiA', 'mmsiB'] as const).map((key) => (
              <p key={key} className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">
                  {names.get(row.original[key]) ?? '—'}
                </span>
                <MmsiText mmsi={row.original[key]} className="text-xs text-muted-foreground" />
              </p>
            ))}
          </div>
        ),
      },
      {
        id: 'peak',
        header: t('collision.table.peak'),
        cell: ({ row }) => <CollisionRiskBadge risk={asRisk(row.original.peakRisk)} />,
      },
      {
        id: 'cpa',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('collision.table.minCpa')}
            <MethodInfo methodId="collision.cpa_tcpa" />
          </span>
        ),
        cell: ({ row }) => <UnitValue value={row.original.minCpaNm} unit="nm" />,
        meta: { className: 'text-right' },
      },
      {
        id: 'tcpa',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('collision.table.tcpa')}
            <MethodInfo methodId="collision.cpa_tcpa" />
          </span>
        ),
        cell: ({ row }) => (
          <UnitValue
            value={closestSample(row.original)?.tcpaMin ?? null}
            unit="minutes"
            digits={1}
          />
        ),
        meta: { className: 'text-right' },
      },
      {
        id: 'started',
        header: t('collision.table.started'),
        cell: ({ row }) => (
          <time
            dateTime={row.original.startedAt}
            title={formatDateTime(row.original.startedAt, i18n.language, 'dd MMM yyyy HH:mm:ss')}
            className="text-xs whitespace-nowrap"
          >
            {formatRelativeTime(row.original.startedAt, i18n.language)}
          </time>
        ),
        meta: { className: 'hidden md:table-cell' },
      },
      {
        id: 'duration',
        header: t('collision.table.duration'),
        cell: ({ row }) => <UnitValue value={encounterDurationMin(row.original)} unit="minutes" />,
        meta: { className: 'hidden text-right lg:table-cell' },
      },
      {
        id: 'state',
        header: t('collision.table.state'),
        cell: ({ row }) =>
          isEncounterActive(row.original) ? (
            <Badge variant="danger" className="gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
              {t('collision.table.active')}
            </Badge>
          ) : (
            <Badge variant="muted">{t('collision.table.ended')}</Badge>
          ),
      },
    ],
    [t, i18n.language, names],
  );

  const filtered = risks.length < RISKS.length || !!mmsi || range !== '24h';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.safety')}
        icon={Radar}
        title={t('collision.title')}
        description={t('collision.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTimeWindow({ range, from: rangeStart(range) });
              void atRisk.refetch();
            }}
            disabled={list.isFetching}
          >
            <RefreshCw className={list.isFetching ? 'animate-spin' : ''} />{' '}
            {t('common:actions.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('collision.stats.high')}
          value={formatNumber(livePairs.high, i18n.language)}
          icon={TriangleAlert}
          tone="danger"
          loading={atRisk.isPending}
          methodId="collision.cpa_tcpa"
          description={t('collision.stats.liveHint')}
        />
        <StatCard
          label={t('collision.stats.medium')}
          value={formatNumber(livePairs.medium, i18n.language)}
          icon={Radar}
          tone="warning"
          loading={atRisk.isPending}
          methodId="collision.cpa_tcpa"
          description={t('collision.stats.liveHint')}
        />
        <StatCard
          label={t('collision.stats.encounters')}
          value={`${formatNumber(list.data?.data.length ?? 0, i18n.language)}${list.data?.page.nextCursor ? '+' : ''}`}
          icon={Ship}
          tone="primary"
          loading={list.isPending}
          description={t(`collision.ranges.${range}`)}
        />
      </div>

      <RiskBandLegend thresholds={thresholds} />

      <section aria-labelledby="encounters-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="encounters-title" className="text-base font-semibold">
              {t('collision.table.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('collision.table.description')}</p>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-3 shadow-xs"
          role="search"
          aria-label={t('collision.filters.label')}
        >
          <ToggleGroup
            type="multiple"
            value={risks}
            onValueChange={(values) => {
              const next = values.filter((v): v is Risk =>
                (RISKS as readonly string[]).includes(v),
              );
              if (next.length)
                update({ risk: next.length === RISKS.length ? null : next.join(',') });
            }}
            aria-label={t('collision.filters.risk')}
          >
            {RISKS.map((risk) => (
              <ToggleGroupItem
                key={risk}
                value={risk}
                className="px-3"
                data-testid={`collision-risk-${risk}`}
              >
                {t(`collision.bands.${risk}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select
            value={range}
            onValueChange={(value) => update({ range: value === '24h' ? null : value })}
          >
            <SelectTrigger
              size="sm"
              aria-label={t('collision.filters.range')}
              className="w-full sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ENCOUNTER_RANGES) as EncounterRange[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`collision.ranges.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <MmsiInput
            value={mmsi}
            onCommit={(value) => update({ mmsi: /^\d{9}$/.test(value) ? value : null })}
          />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => update({ risk: null, range: null, mmsi: null })}
            >
              <FilterX /> {t('collision.filters.reset')}
            </Button>
          )}
        </div>
        <DataTable
          ariaLabel={t('collision.table.title')}
          columns={columns}
          data={list.data?.data}
          loading={list.isPending}
          error={list.isError ? localizeProblem(list.error, safetyProblemCopies(t)) : undefined}
          onRetry={() => void list.refetch()}
          getRowId={(row) => row.encounterId}
          onRowClick={(row) => update({ encounter: row.encounterId })}
          pagination={cursor.adapter(list.data?.page.nextCursor, list.isFetching)}
          emptyState={
            <EmptyState
              size="sm"
              icon={ShieldCheck}
              title={filtered ? t('collision.table.emptyFiltered') : t('collision.table.empty')}
              description={
                filtered ? t('collision.table.emptyFilteredHint') : t('collision.table.emptyHint')
              }
            />
          }
        />
      </section>

      <EncounterDetailSheet
        open={!!selectedId}
        onOpenChange={(open) => !open && update({ encounter: null })}
        encounter={selected}
        loading={!selected && (list.isPending || single.isFetching)}
        names={names}
        thresholds={thresholds}
      />
    </div>
  );
}
