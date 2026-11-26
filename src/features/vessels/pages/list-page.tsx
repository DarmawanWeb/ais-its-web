import { VESSEL_STATUS_LABELS, VESSEL_STATUSES } from '@darmawanweb/ais-its-contracts/domain';
import type { VisibilityState } from '@tanstack/react-table';
import { Anchor, Plus, Search, Ship, ShipWheel, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useVesselTypesControllerList } from '@/shared/api/generated/fleet/vessel-types/vessel-types';
import { Can } from '@/shared/auth/guards';
import { usePermission, useSession } from '@/shared/auth/hooks';
import { DataTable } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { useFleetCiiGrades, useLastSeen, useVesselCount, useVesselList } from '../api/vessels';
import { useAppLanguage } from '@/shared/i18n';
import { useVesselColumns } from '../hooks/use-vessel-columns';
import { useVesselListState } from '../hooks/use-vessel-list-state';
import { VesselTableContext } from '../hooks/vessel-table-context';
import { localizeProblem } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';

const ALL = 'all';
/** Columns hidden below 768 px (the name cell shows the MMSI there). */
const MOBILE_HIDDEN: VisibilityState = {
  mmsi: false,
  imo: false,
  type: false,
  flag: false,
  tonnage: false,
};

/** Fleet list: search (name / MMSI / IMO), type and status filters, page pagination. */
export function ListPage() {
  const { t, i18n } = useTranslation('vessels');
  const locale = useAppLanguage();
  const navigate = useNavigate();
  const { orgId } = useSession();
  const canReadCii = usePermission('cii:read');
  const wide = useMediaQuery('(min-width: 768px)');
  const { state, update } = useVesselListState(Boolean(orgId));

  const [searchInput, setSearchInput] = useState(state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== state.search) update({ search: debouncedSearch });
    // Only the debounced input drives the URL; the URL is the source of truth otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const scopeOrg = state.scope === 'fleet' && orgId ? orgId : undefined;
  const list = useVesselList({
    page: state.page,
    pageSize: state.pageSize,
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    ...(state.typeCode ? { typeCode: state.typeCode } : {}),
    ...(state.status ? { status: state.status } : {}),
    ...(scopeOrg ? { orgId: scopeOrg } : {}),
  });
  const types = useVesselTypesControllerList({ pageSize: 100 }, { query: { staleTime: 600_000 } });
  const scopeParams = scopeOrg ? { orgId: scopeOrg } : {};
  const total = useVesselCount(scopeParams);
  const active = useVesselCount({ ...scopeParams, status: 'active' });
  const laidUp = useVesselCount({ ...scopeParams, status: 'laid_up' });
  const fleetCii = useFleetCiiGrades(canReadCii && Boolean(orgId));

  const vessels = list.data?.data;
  const mmsis = useMemo(() => (vessels ?? []).map((vessel) => vessel.mmsi), [vessels]);
  const lastSeen = useLastSeen(mmsis);
  const columns = useVesselColumns({ ciiVisible: canReadCii });
  const tableData = useMemo(
    () => ({ lastSeen: lastSeen.byMmsi, lastSeenPending: lastSeen.pending, cii: fleetCii.byMmsi }),
    [lastSeen.byMmsi, lastSeen.pending, fleetCii.byMmsi],
  );
  const [visibility, setVisibility] = useState<VisibilityState>({});

  const filtered = Boolean(state.search || state.typeCode || state.status);
  const grades = fleetCii.summary?.grades;
  const attention = grades ? grades.D + grades.E : null;
  const copies = fleetProblemCopies(t);
  const resetFilters = () => {
    setSearchInput('');
    update({ search: '', typeCode: '', status: '' });
  };

  const emptyState = filtered ? (
    <EmptyState
      icon={Search}
      size="sm"
      title={t('list.noMatch')}
      description={t('list.noMatchDescription')}
      action={
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <X /> {t('list.resetFilters')}
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Ship}
      size="sm"
      title={state.scope === 'fleet' ? t('list.emptyFleet') : t('list.emptyAll')}
      description={t('list.emptyDescription')}
      action={
        <Can
          permission="vessel:write"
          fallback={<p className="text-xs text-muted-foreground">{t('list.emptyNoWrite')}</p>}
        >
          <Button asChild size="sm">
            <Link to="/vessels/new">
              <Plus /> {t('actions.create')}
            </Link>
          </Button>
        </Can>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.fleet')}
        title={t('list.title')}
        description={t('list.description')}
        icon={Ship}
        actions={
          <Can permission="vessel:write">
            <Button asChild>
              <Link to="/vessels/new">
                <Plus /> {t('actions.create')}
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={state.scope === 'fleet' ? t('stats.fleet') : t('stats.registered')}
          value={formatNumber(total.data ?? null, i18n.language)}
          loading={total.isPending}
          icon={Ship}
          tone="primary"
        />
        <StatCard
          label={t('stats.active')}
          value={formatNumber(active.data ?? null, i18n.language)}
          loading={active.isPending}
          icon={ShipWheel}
          tone="success"
        />
        <StatCard
          label={t('stats.laidUp')}
          value={formatNumber(laidUp.data ?? null, i18n.language)}
          loading={laidUp.isPending}
          icon={Anchor}
          tone="warning"
        />
        {canReadCii && orgId ? (
          <StatCard
            label={t('stats.ciiAttention')}
            value={formatNumber(attention, i18n.language)}
            loading={fleetCii.isPending}
            icon={TriangleAlert}
            tone="danger"
            methodId="cii.rating_grade"
            description={fleetCii.error ? t('stats.ciiUnavailable') : t('stats.ciiAttentionHint')}
          />
        ) : null}
      </div>

      <VesselTableContext.Provider value={tableData}>
        <DataTable
          ariaLabel={t('list.tableLabel')}
          columns={columns}
          data={vessels}
          loading={list.isPending}
          error={localizeProblem(list.error, copies)}
          onRetry={() => void list.refetch()}
          getRowId={(vessel) => vessel.id}
          onRowClick={(vessel) => void navigate(`/vessels/${vessel.mmsi}`)}
          enableColumnVisibility={wide}
          columnVisibility={wide ? visibility : MOBILE_HIDDEN}
          onColumnVisibilityChange={setVisibility}
          emptyState={emptyState}
          pagination={{
            mode: 'page',
            page: list.data?.meta.page ?? state.page,
            pageSize: list.data?.meta.pageSize ?? state.pageSize,
            total: list.data?.meta.total ?? 0,
            onPageChange: (page) => update({ page }),
            onPageSizeChange: (pageSize) => update({ pageSize }),
          }}
          toolbar={
            <>
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t('list.searchPlaceholder')}
                  aria-label={t('list.searchLabel')}
                  className="pl-8"
                  maxLength={120}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="vessel-type-filter" className="sr-only">
                  {t('filters.type')}
                </Label>
                <Select
                  value={state.typeCode || ALL}
                  onValueChange={(value) => update({ typeCode: value === ALL ? '' : value })}
                >
                  <SelectTrigger id="vessel-type-filter" className="w-44" size="sm">
                    <SelectValue placeholder={t('filters.type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('filters.allTypes')}</SelectItem>
                    {(types.data?.data ?? []).map((type) => (
                      <SelectItem key={type.id} value={type.code}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="vessel-status-filter" className="sr-only">
                  {t('filters.status')}
                </Label>
                <Select
                  value={state.status || ALL}
                  onValueChange={(value) =>
                    update({ status: value === ALL ? '' : (value as typeof state.status) })
                  }
                >
                  <SelectTrigger id="vessel-status-filter" className="w-40" size="sm">
                    <SelectValue placeholder={t('filters.status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('filters.allStatuses')}</SelectItem>
                    {VESSEL_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {VESSEL_STATUS_LABELS[status][locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {orgId && (
                <ToggleGroup
                  type="single"
                  value={state.scope}
                  onValueChange={(value) => value && update({ scope: value as typeof state.scope })}
                  aria-label={t('filters.scope')}
                  className="rounded-lg border bg-muted/40 p-0.5"
                >
                  <ToggleGroupItem value="fleet">{t('filters.scopeFleet')}</ToggleGroupItem>
                  <ToggleGroupItem value="all">{t('filters.scopeAll')}</ToggleGroupItem>
                </ToggleGroup>
              )}
              {filtered && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X /> {t('list.resetFilters')}
                </Button>
              )}
            </>
          }
        />
      </VesselTableContext.Provider>
      {state.scope === 'all' && (
        <p className="-mt-3 text-xs text-muted-foreground">{t('list.allScopeNote')}</p>
      )}
    </div>
  );
}
