import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  EngineDto,
  EnginesControllerListKind,
  FuelDto,
  FuelFormulaDto,
  PortDto,
  RegistryParticularsDto,
  VesselTypeDto,
} from '@/shared/api/generated/fleet/model';
import { toApiProblem } from '@/shared/api/problem';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { CoordinateText, MmsiText, UnitValue } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import {
  useEngineMutations,
  useEngines,
  useFuelFormulaMutations,
  useFuelFormulas,
  useFuelMutations,
  useFuels,
  usePortMutations,
  usePorts,
  useRegistrySearch,
  useVesselTypeMutations,
  useVesselTypes,
} from '../../api/fleet-admin';
import { problemMessage } from '@/shared/api/problem-copy';
import { SearchInput } from '../common';
import { EngineEditor, FormulaEditor, FuelEditor, PortEditor, VesselTypeEditor } from './forms';
import { ReferenceTab } from './reference-tab';

function useListState() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 300);
  const paging = usePageState({ pageSize: 20 });
  return {
    search,
    term,
    paging,
    onSearch: (value: string) => {
      setSearch(value);
      paging.setPage(1);
    },
  };
}

function Header({ label, methodId }: { label: string; methodId?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {methodId && <MethodInfo methodId={methodId} />}
    </span>
  );
}

/** A coefficient of the CII reference line; very large ones (LNG carriers) as m × 10^e. */
function Coefficient({ value, language }: { value: number; language: string }) {
  if (Math.abs(value) < 1e6) {
    return <>{formatNumber(value, language, { maximumFractionDigits: 2 })}</>;
  }
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  return (
    <>
      {formatNumber(value / 10 ** exponent, language, { maximumFractionDigits: 4 })}×10
      <sup>{exponent}</sup>
    </>
  );
}

function SourceCell({ source }: { source: string | null }) {
  if (!source) return <span className="text-muted-foreground">—</span>;
  return (
    <SimpleTooltip label={source}>
      <button
        type="button"
        className="block max-w-40 cursor-help truncate rounded-sm text-left text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {source}
      </button>
    </SimpleTooltip>
  );
}

/** Delete confirmation of a reference row (409 REFERENCE_IN_USE while vessels use it). */
function useDeleteRow<T extends { id: string }>(
  remove: { mutateAsync: (id: string) => Promise<unknown> },
  name: (row: T) => string,
) {
  const { t } = useTranslation('admin');
  const [row, setRow] = useState<T | null>(null);
  const dialog = (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={(open) => !open && setRow(null)}
      title={t('reference.delete.title', { name: row ? name(row) : '' })}
      description={t('reference.delete.description')}
      confirmLabel={t('common:actions.delete')}
      destructive
      onConfirm={async () => {
        if (!row) return;
        try {
          await remove.mutateAsync(row.id);
          toast.success(t('reference.toasts.deleted', { name: name(row) }));
        } catch (error) {
          const problem = toApiProblem(error);
          toast.error(
            problem.code === 'REFERENCE_IN_USE'
              ? t('reference.toasts.inUseTitle')
              : t('reference.toasts.deleteFailed'),
            { description: problemMessage(t, error) },
          );
        } finally {
          setRow(null);
        }
      }}
    />
  );
  return { open: setRow, dialog };
}

// --- vessel types ---------------------------------------------------------------------------

export function VesselTypesTab({ canWrite }: { canWrite: boolean }) {
  const { t, i18n } = useTranslation('admin');
  const state = useListState();
  const query = useVesselTypes({
    page: state.paging.page,
    pageSize: state.paging.pageSize,
    search: state.term,
  });
  const { remove } = useVesselTypeMutations();
  const [editing, setEditing] = useState<{ value?: VesselTypeDto } | null>(null);
  const deletion = useDeleteRow<VesselTypeDto>(remove, (row) => row.name);
  const columns = useMemo<ColumnDef<VesselTypeDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'unit',
        header: t('reference.vesselTypes.capacityUnit'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <Badge variant="outline">{row.original.capacityUnit}</Badge>
            {row.original.capacityFixed !== null && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {t('reference.vesselTypes.capacityFixed')}:{' '}
                {formatNumber(row.original.capacityFixed, i18n.language)}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'line',
        header: () => (
          <Header label={t('reference.vesselTypes.line')} methodId="cii.reference_line" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            <Coefficient value={row.original.a} language={i18n.language} /> · C
            <sup>−{formatNumber(row.original.c, i18n.language, { maximumFractionDigits: 3 })}</sup>
          </span>
        ),
      },
      {
        id: 'dd',
        header: () => <Header label={t('reference.vesselTypes.dd')} methodId="cii.rating_grade" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {[row.original.d.d1, row.original.d.d2, row.original.d.d3, row.original.d.d4]
              .map((d) => formatNumber(d, i18n.language, { minimumFractionDigits: 2 }))
              .join(' · ')}
          </span>
        ),
      },
      {
        id: 'source',
        header: t('reference.fields.source'),
        cell: ({ row }) => <SourceCell source={row.original.source} />,
      },
    ],
    [t, i18n.language],
  );
  return (
    <>
      <ReferenceTab
        label={t('reference.vesselTypes.table')}
        columns={columns}
        rows={query.data?.data}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        pagination={state.paging.adapter(query.data?.meta)}
        search={state.search}
        onSearch={state.onSearch}
        searchPlaceholder={t('reference.vesselTypes.search')}
        canWrite={canWrite}
        createLabel={t('reference.vesselTypes.create')}
        onCreate={() => setEditing({})}
        onEdit={(value) => setEditing({ value })}
        onDelete={deletion.open}
        rowName={(row) => row.name}
        emptyTitle={t('reference.vesselTypes.empty')}
        emptyHint={t('reference.emptyHint')}
      />
      <VesselTypeEditor
        value={editing?.value}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {deletion.dialog}
    </>
  );
}

// --- fuels ----------------------------------------------------------------------------------

export function FuelsTab({ canWrite }: { canWrite: boolean }) {
  const { t, i18n } = useTranslation('admin');
  const state = useListState();
  const query = useFuels({
    page: state.paging.page,
    pageSize: state.paging.pageSize,
    search: state.term,
  });
  const { remove } = useFuelMutations();
  const [editing, setEditing] = useState<{ value?: FuelDto } | null>(null);
  const deletion = useDeleteRow<FuelDto>(remove, (row) => row.name);
  const columns = useMemo<ColumnDef<FuelDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'cf',
        header: () => <Header label={t('reference.fuels.cf')} methodId="emission.co2_conversion" />,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatNumber(row.original.conversionFactor, i18n.language, {
              maximumFractionDigits: 4,
            })}
          </span>
        ),
      },
      {
        id: 'carbon',
        header: t('reference.fuels.carbon'),
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatNumber(row.original.carbonContent, i18n.language, { maximumFractionDigits: 4 })}
          </span>
        ),
      },
      {
        id: 'density',
        header: () => (
          <Header label={t('reference.fuels.densityShort')} methodId="fuel.density_conversion" />
        ),
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatNumber(row.original.density, i18n.language, { maximumFractionDigits: 4 })} t/m³
          </span>
        ),
      },
      {
        id: 'source',
        header: t('reference.fields.source'),
        cell: ({ row }) => <SourceCell source={row.original.source} />,
      },
    ],
    [t, i18n.language],
  );
  return (
    <>
      <ReferenceTab
        label={t('reference.fuels.table')}
        columns={columns}
        rows={query.data?.data}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        pagination={state.paging.adapter(query.data?.meta)}
        search={state.search}
        onSearch={state.onSearch}
        searchPlaceholder={t('reference.fuels.search')}
        canWrite={canWrite}
        createLabel={t('reference.fuels.create')}
        onCreate={() => setEditing({})}
        onEdit={(value) => setEditing({ value })}
        onDelete={deletion.open}
        rowName={(row) => row.name}
        emptyTitle={t('reference.fuels.empty')}
        emptyHint={t('reference.emptyHint')}
      />
      <FuelEditor
        value={editing?.value}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {deletion.dialog}
    </>
  );
}

// --- engines --------------------------------------------------------------------------------

const ALL = 'all';

export function EnginesTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation('admin');
  const state = useListState();
  const [kind, setKind] = useState<string>(ALL);
  const query = useEngines({
    page: state.paging.page,
    pageSize: state.paging.pageSize,
    search: state.term,
    kind: kind === ALL ? undefined : (kind as EnginesControllerListKind),
  });
  const { remove } = useEngineMutations();
  const [editing, setEditing] = useState<{ value?: EngineDto } | null>(null);
  const deletion = useDeleteRow<EngineDto>(remove, (row) => row.name);
  const columns = useMemo<ColumnDef<EngineDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.original.code ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('reference.engines.kind'),
        cell: ({ row }) => (
          <Badge variant={row.original.kind === 'main' ? 'primary' : 'outline'}>
            {t(`reference.engines.kinds.${row.original.kind}`)}
          </Badge>
        ),
      },
      {
        id: 'power',
        header: t('reference.engines.power'),
        meta: { className: 'text-right' },
        cell: ({ row }) => <UnitValue value={row.original.powerKw} unit="kw" />,
      },
      {
        id: 'rpm',
        header: t('reference.engines.rpm'),
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">{row.original.rpm}</span>
        ),
      },
      {
        id: 'sfoc',
        header: () => (
          <Header label={t('reference.engines.sfoc')} methodId="fuel.second_formula_me" />
        ),
        meta: { className: 'text-right' },
        cell: ({ row }) => <UnitValue value={row.original.sfoc} unit="gkwh" />,
      },
      {
        id: 'source',
        header: t('reference.fields.source'),
        cell: ({ row }) => <SourceCell source={row.original.source} />,
      },
    ],
    [t],
  );
  return (
    <>
      <ReferenceTab
        label={t('reference.engines.table')}
        columns={columns}
        rows={query.data?.data}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        pagination={state.paging.adapter(query.data?.meta)}
        search={state.search}
        onSearch={state.onSearch}
        searchPlaceholder={t('reference.engines.search')}
        toolbar={
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              state.paging.setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label={t('reference.engines.kind')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('reference.engines.allKinds')}</SelectItem>
              <SelectItem value="main">{t('reference.engines.kinds.main')}</SelectItem>
              <SelectItem value="auxiliary">{t('reference.engines.kinds.auxiliary')}</SelectItem>
            </SelectContent>
          </Select>
        }
        canWrite={canWrite}
        createLabel={t('reference.engines.create')}
        onCreate={() => setEditing({})}
        onEdit={(value) => setEditing({ value })}
        onDelete={deletion.open}
        rowName={(row) => row.name}
        emptyTitle={t('reference.engines.empty')}
        emptyHint={t('reference.emptyHint')}
      />
      <EngineEditor
        value={editing?.value}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {deletion.dialog}
    </>
  );
}

// --- fuel formulas --------------------------------------------------------------------------

export function FormulasTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation('admin');
  const state = useListState();
  const query = useFuelFormulas({
    page: state.paging.page,
    pageSize: state.paging.pageSize,
    search: state.term,
  });
  const { remove } = useFuelFormulaMutations();
  const [editing, setEditing] = useState<{ value?: FuelFormulaDto } | null>(null);
  const deletion = useDeleteRow<FuelFormulaDto>(remove, (row) => row.name);
  const columns = useMemo<ColumnDef<FuelFormulaDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.original.code ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'main',
        header: () => (
          <Header label={t('reference.formulas.mainShort')} methodId="fuel.first_formula" />
        ),
        cell: ({ row }) => (
          <code className="block max-w-72 truncate font-mono text-xs">
            {row.original.mainEngineFormula}
          </code>
        ),
      },
      {
        id: 'aux',
        header: t('reference.formulas.auxiliaryShort'),
        cell: ({ row }) => (
          <code className="block max-w-72 truncate font-mono text-xs">
            {row.original.auxiliaryEngineFormula}
          </code>
        ),
      },
      {
        id: 'source',
        header: t('reference.fields.source'),
        cell: ({ row }) => <SourceCell source={row.original.source} />,
      },
    ],
    [t],
  );
  return (
    <>
      <ReferenceTab
        label={t('reference.formulas.table')}
        columns={columns}
        rows={query.data?.data}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        pagination={state.paging.adapter(query.data?.meta)}
        search={state.search}
        onSearch={state.onSearch}
        searchPlaceholder={t('reference.formulas.search')}
        canWrite={canWrite}
        createLabel={t('reference.formulas.create')}
        onCreate={() => setEditing({})}
        onEdit={(value) => setEditing({ value })}
        onDelete={deletion.open}
        rowName={(row) => row.name}
        emptyTitle={t('reference.formulas.empty')}
        emptyHint={t('reference.emptyHint')}
      />
      <FormulaEditor
        value={editing?.value}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {deletion.dialog}
    </>
  );
}

// --- ports ----------------------------------------------------------------------------------

export function PortsTab({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation('admin');
  const state = useListState();
  const query = usePorts({
    page: state.paging.page,
    pageSize: state.paging.pageSize,
    search: state.term,
  });
  const { remove } = usePortMutations();
  const [editing, setEditing] = useState<{ value?: PortDto } | null>(null);
  const deletion = useDeleteRow<PortDto>(remove, (row) => row.name);
  const columns = useMemo<ColumnDef<PortDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'position',
        header: t('common:domain.position'),
        cell: ({ row }) => (
          <CoordinateText
            lat={row.original.location.coordinates[1]}
            lon={row.original.location.coordinates[0]}
            precision={4}
            className="text-xs"
          />
        ),
      },
      {
        id: 'radius',
        header: t('reference.ports.radius'),
        meta: { className: 'text-right' },
        cell: ({ row }) => <UnitValue value={row.original.radiusM} unit="m" />,
      },
      {
        id: 'admin',
        header: t('reference.ports.admin'),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.administrativeLocation ?? '—'}</span>
        ),
      },
      {
        id: 'source',
        header: t('reference.fields.source'),
        cell: ({ row }) => <SourceCell source={row.original.source} />,
      },
    ],
    [t],
  );
  return (
    <>
      <ReferenceTab
        label={t('reference.ports.table')}
        columns={columns}
        rows={query.data?.data}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        pagination={state.paging.adapter(query.data?.meta)}
        search={state.search}
        onSearch={state.onSearch}
        searchPlaceholder={t('reference.ports.search')}
        canWrite={canWrite}
        createLabel={t('reference.ports.create')}
        onCreate={() => setEditing({})}
        onEdit={(value) => setEditing({ value })}
        onDelete={deletion.open}
        rowName={(row) => row.name}
        emptyTitle={t('reference.ports.empty')}
        emptyHint={t('reference.emptyHint')}
      />
      <PortEditor
        value={editing?.value}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      {deletion.dialog}
    </>
  );
}

// --- registry (read-only) -------------------------------------------------------------------

export function RegistryTab() {
  const { t, i18n } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 350);
  const paging = usePageState({ pageSize: 20 });
  const query = useRegistrySearch(term, paging.page, paging.pageSize);
  const columns = useMemo<ColumnDef<RegistryParticularsDto>[]>(
    () => [
      {
        id: 'name',
        header: t('reference.fields.name'),
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.typeName ?? row.original.type ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'mmsi',
        header: 'MMSI',
        cell: ({ row }) => <MmsiText mmsi={row.original.mmsi} className="text-xs" />,
      },
      {
        id: 'imo',
        header: 'IMO',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.imo ?? '—'}</span>,
      },
      {
        id: 'flag',
        header: t('reference.registry.flag'),
        cell: ({ row }) => row.original.flagName ?? row.original.flag ?? '—',
      },
      {
        id: 'built',
        header: t('reference.registry.built'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.built ?? '—'}</span>,
      },
      {
        id: 'gt',
        header: 'GT / DWT',
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatNumber(row.original.gt, i18n.language)} /{' '}
            {formatNumber(row.original.dwt, i18n.language)}
          </span>
        ),
      },
      {
        id: 'loa',
        header: 'LOA',
        meta: { className: 'text-right' },
        cell: ({ row }) => <UnitValue value={row.original.loaM} unit="m" digits={1} />,
      },
      {
        id: 'class',
        header: t('reference.registry.class'),
        cell: ({ row }) => row.original.class ?? '—',
      },
    ],
    [t, i18n.language],
  );
  return (
    <DataTable
      ariaLabel={t('reference.registry.table')}
      columns={columns}
      data={term.length >= 2 ? query.data?.data : []}
      loading={term.length >= 2 && query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      getRowId={(row) => row.id}
      pagination={term.length >= 2 ? paging.adapter(query.data?.meta) : undefined}
      toolbar={
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            paging.setPage(1);
          }}
          label={t('reference.registry.search')}
          placeholder={t('reference.registry.searchPlaceholder')}
          className="sm:w-80"
        />
      }
      emptyState={
        <EmptyState
          size="sm"
          title={term.length >= 2 ? t('reference.noMatches') : t('reference.registry.prompt')}
          description={
            term.length >= 2 ? t('reference.noMatchesHint') : t('reference.registry.promptHint')
          }
        />
      }
    />
  );
}
