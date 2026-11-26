import { ZONE_KINDS, ZONE_KIND_LABELS, type ZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BellRing,
  ChevronDown,
  Download,
  FileJson,
  FileUp,
  Hexagon,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { zonesControllerGeojson } from '@/shared/api/generated/geo/zones/zones';
import type { ZoneFeatureCollectionDto, ZoneSummaryDto } from '@/shared/api/generated/geo/model';
import { toApiProblem } from '@/shared/api/problem';
import { useSession } from '@/shared/auth';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { UnitValue } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { MapLegend, MapView } from '@/shared/map';
import { downloadCsv } from '@/shared/lib/csv';
import { formatNumber, formatRelativeTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import {
  deleteZone,
  useAllZones,
  useInvalidateZones,
  useZonesGeojson,
  useZonesList,
} from '../api/zones-api';
import { ConflictDialog } from '../components/conflict-dialog';
import { ImportDialog } from '../components/import-dialog';
import { FitToBBox, ZonesLayer } from '../components/maps/zone-layers';
import { ZoneKindBadge, ZoneScopeBadge } from '../components/zone-bits';
import { useZoneAccess } from '../hooks/use-zone-access';
import { downloadGeoJson } from '../lib/geojson-io';
import { kindCss } from '../lib/kind-style';
import { currentEtagOf, zoneProblemMessage } from '../lib/problems';

type Scope = 'all' | 'global' | 'org';
type ActiveFilter = 'all' | 'active' | 'inactive';

function kindsFromSearch(search: URLSearchParams): ZoneKind[] {
  return (search.get('kind') ?? '')
    .split(',')
    .filter((kind): kind is ZoneKind => (ZONE_KINDS as readonly string[]).includes(kind));
}

/**
 * Zone registry (`/zones`): global and organization zones of the geo service, filtered by kind,
 * scope, state and text, with their map, GeoJSON import/export, CSV export and deletion with
 * optimistic concurrency (`If-Match`).
 */
export function ZonesPage() {
  const { t, i18n } = useTranslation('zones');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const navigate = useNavigate();
  const { orgId } = useSession();
  const access = useZoneAccess();
  const invalidate = useInvalidateZones();
  const [search, setSearch] = useSearchParams();
  const kinds = kindsFromSearch(search);
  const scopeParam = search.get('scope');
  const scope: Scope =
    scopeParam === 'global' || (scopeParam === 'org' && orgId) ? scopeParam : 'all';
  const activeParam = search.get('state');
  const active: ActiveFilter =
    activeParam === 'active' || activeParam === 'inactive' ? activeParam : 'all';
  const [text, setText] = useState(search.get('q') ?? '');
  const query = useDebouncedValue(text.trim(), 300);
  const pages = usePageState({ pageSize: 20 });
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ZoneSummaryDto | null>(null);
  const [conflict, setConflict] = useState<{
    zone: ZoneSummaryDto;
    currentEtag: string | null;
  } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
    pages.setPage(1);
  };

  const filters = {
    ...(kinds.length > 0 ? { kind: kinds } : {}),
    ...(active === 'all' ? {} : { active: active === 'active' }),
    ...(query ? { search: query } : {}),
    ...(scope === 'org' && orgId ? { orgId } : {}),
  };
  const list = useZonesList(
    { ...filters, page: pages.page, pageSize: pages.pageSize },
    scope !== 'global',
  );
  const all = useAllZones(filters, scope === 'global');
  const globalRows = useMemo(() => (all.data ?? []).filter((zone) => zone.global), [all.data]);

  const mapFilters = {
    ...(kinds.length > 0 ? { kind: kinds } : {}),
    ...(scope === 'org' && orgId ? { orgId } : {}),
    zoom: 8,
  };
  const activeMap = useZonesGeojson({ ...mapFilters, active: true }, active !== 'inactive');
  const inactiveMap = useZonesGeojson({ ...mapFilters, active: false }, active !== 'active');
  const collection = useMemo<ZoneFeatureCollectionDto | undefined>(() => {
    const parts = [
      active !== 'inactive' ? activeMap.data : undefined,
      active !== 'active' ? inactiveMap.data : undefined,
    ].filter((part): part is ZoneFeatureCollectionDto => !!part);
    if (parts.length === 0) return undefined;
    const needle = query.toLowerCase();
    const features = parts
      .flatMap((part) => part.features)
      .filter(
        (feature) =>
          (scope !== 'global' || feature.properties.global) &&
          (!needle ||
            feature.properties.name.toLowerCase().includes(needle) ||
            feature.properties.code.toLowerCase().includes(needle)),
      );
    return {
      ...parts[0]!,
      features,
      featureCount: features.length,
      truncated: parts.some((part) => part.truncated),
    };
  }, [activeMap.data, inactiveMap.data, active, scope, query]);

  const rows = scope === 'global' ? globalRows : list.data?.data;
  const loading = scope === 'global' ? all.isPending : list.isPending;
  const error =
    scope === 'global'
      ? all.isError
        ? all.error
        : undefined
      : list.isError
        ? list.error
        : undefined;
  const filtered = kinds.length > 0 || active !== 'all' || !!query || scope !== 'all';

  const removeZone = async (zone: ZoneSummaryDto, ifMatch: string) => {
    try {
      await deleteZone(zone.id, ifMatch);
      invalidate({ deletedId: zone.id });
      toast.success(t('toast.deleted', { name: zone.name }));
      setConflict(null);
    } catch (cause) {
      const problem = toApiProblem(cause);
      if (problem.code === 'ZONE_VERSION_CONFLICT') {
        setConflict({ zone, currentEtag: currentEtagOf(problem) });
        return;
      }
      const message = zoneProblemMessage(problem);
      toast.error(t('toast.deleteFailed'), {
        description: t(`problems.${message.key}`, message.params),
      });
    }
  };

  const columns = useMemo<ColumnDef<ZoneSummaryDto>[]>(
    () => [
      {
        id: 'name',
        header: t('table.name'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex w-64 min-w-0 flex-col">
            <Link
              to={`/zones/${row.original.id}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="truncate font-medium hover:text-primary hover:underline"
            >
              {row.original.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{row.original.code}</span> ·{' '}
              {t('table.updatedAgo', {
                when: formatRelativeTime(row.original.updatedAt, i18n.language),
              })}
            </span>
          </span>
        ),
      },
      {
        id: 'kind',
        header: t('table.kind'),
        enableSorting: false,
        // A table cell's max-width does not bound its content: the badge itself is bounded
        // and long kind labels wrap instead of running into the scope column.
        cell: ({ row }) => <ZoneKindBadge kind={row.original.kind} wrap className="w-48" />,
      },
      {
        id: 'scope',
        header: t('table.scope'),
        enableSorting: false,
        cell: ({ row }) => (
          <ZoneScopeBadge global={row.original.global} orgId={row.original.orgId} />
        ),
      },
      {
        id: 'geometry',
        header: t('table.geometry'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col whitespace-nowrap">
            <span className="text-sm">{row.original.geometryType}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {t('table.vertices', {
                value: formatNumber(row.original.vertexCount, i18n.language),
              })}
            </span>
          </span>
        ),
      },
      {
        id: 'buffer',
        header: t('table.buffer'),
        enableSorting: false,
        cell: ({ row }) => <UnitValue value={row.original.bufferM} unit="m" />,
      },
      {
        id: 'flags',
        header: t('table.state'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={row.original.active ? 'success' : 'muted'}>
              {row.original.active ? t('state.active') : t('state.inactive')}
            </Badge>
            {row.original.alertOnEnter && (
              <Badge variant="warning" className="gap-1" title={t('form.alertOnEnter')}>
                <BellRing className="size-3" aria-hidden /> {t('state.alerting')}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.actions')}</span>,
        enableSorting: false,
        cell: ({ row }) => (
          // Menu events bubble through the portal to the row: keep them from opening the zone.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('table.actionsFor', { name: row.original.name })}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void navigate(`/zones/${row.original.id}`)}>
                  <Hexagon />{' '}
                  {access.canWriteZone(row.original) ? t('actions.edit') : t('actions.view')}
                </DropdownMenuItem>
                {access.canWriteZone(row.original) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setToDelete(row.original)}
                    >
                      <Trash2 /> {t('common:actions.delete')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        meta: { className: 'w-12' },
      },
    ],
    [t, i18n.language, navigate, access, setToDelete],
  );

  const exportGeoJson = async () => {
    try {
      const data = await zonesControllerGeojson(
        {
          ...(kinds.length > 0 ? { kind: kinds } : {}),
          ...(scope === 'org' && orgId ? { orgId } : {}),
          ...(active === 'inactive' ? { active: false } : {}),
        },
        { paramsSerializer: { indexes: null } },
      );
      const features = data.features.filter(
        (feature) => scope !== 'global' || feature.properties.global,
      );
      downloadGeoJson(`zones-${new Date().toISOString().slice(0, 10)}`, {
        type: 'FeatureCollection',
        features,
      });
      toast.success(t('toast.exported', { count: features.length }), {
        description: data.truncated ? t('toast.exportTruncated') : undefined,
      });
    } catch (cause) {
      toast.error(t('toast.exportFailed'), { description: toApiProblem(cause).title });
    }
  };

  const exportCsv = () => {
    const items = rows ?? [];
    downloadCsv(
      `zones-${new Date().toISOString().slice(0, 10)}`,
      items.map((zone) => ({
        id: zone.id,
        code: zone.code,
        name: zone.name,
        kind: zone.kind,
        global: zone.global,
        orgId: zone.orgId ?? '',
        bufferM: zone.bufferM,
        alertOnEnter: zone.alertOnEnter,
        active: zone.active,
        geometryType: zone.geometryType,
        vertexCount: zone.vertexCount,
        source: zone.source ?? '',
        updatedAt: zone.updatedAt,
      })),
    );
    toast.success(t('toast.csvExported', { count: items.length }));
  };

  const legendKinds = (
    kinds.length > 0
      ? kinds
      : [...new Set((collection?.features ?? []).map((feature) => feature.properties.kind))]
  ).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('zones.title')}
        description={t('zones.description')}
        icon={Hexagon}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> {t('common:actions.export')} <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportGeoJson()}>
                  <FileJson /> {t('actions.exportGeojson')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={exportCsv} disabled={!rows?.length}>
                  <Download /> {t('actions.exportCsv')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {access.canCreate && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <FileUp /> {t('actions.import')}
                </Button>
                <Button asChild>
                  <Link to="/zones/new">
                    <Plus /> {t('actions.create')}
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      <div
        role="search"
        aria-label={t('filters.label')}
        className="flex flex-col gap-3 rounded-xl border bg-surface p-3 shadow-xs lg:flex-row lg:flex-wrap lg:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:max-w-xs">
          <Label htmlFor="zone-search" className="text-xs text-muted-foreground">
            {t('filters.search')}
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="zone-search"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setParam('q', event.target.value.trim());
              }}
              placeholder={t('filters.searchPlaceholder')}
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground" id="zone-scope-label">
            {t('filters.scope')}
          </span>
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(value) => value && setParam('scope', value === 'all' ? null : value)}
            aria-labelledby="zone-scope-label"
          >
            <ToggleGroupItem value="all" className="h-7 px-3">
              {t('scope.all')}
            </ToggleGroupItem>
            <ToggleGroupItem value="global" className="h-7 px-3">
              {t('scope.global')}
            </ToggleGroupItem>
            <ToggleGroupItem value="org" className="h-7 px-3" disabled={!orgId}>
              {t('scope.yourOrg')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('filters.kind')}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between sm:w-48">
                  <span className="truncate">
                    {kinds.length === 0
                      ? t('filters.allKinds')
                      : kinds.length === 1
                        ? ZONE_KIND_LABELS[kinds[0]!][locale]
                        : t('filters.kindsSelected', { value: kinds.length })}
                  </span>
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>{t('filters.kind')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ZONE_KINDS.map((kind) => (
                  <DropdownMenuCheckboxItem
                    key={kind}
                    checked={kinds.includes(kind)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...kinds, kind]
                        : kinds.filter((item) => item !== kind);
                      setParam('kind', next.join(','));
                    }}
                  >
                    <span
                      className="size-2.5 rounded-sm"
                      style={{ background: kindCss(kind) }}
                      aria-hidden
                    />
                    {ZONE_KIND_LABELS[kind][locale]}
                  </DropdownMenuCheckboxItem>
                ))}
                {kinds.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setParam('kind', null)}>
                      {t('filters.clearKinds')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="zone-state" className="text-xs text-muted-foreground">
              {t('filters.state')}
            </Label>
            <Select
              value={active}
              onValueChange={(value) => setParam('state', value === 'all' ? null : value)}
            >
              <SelectTrigger id="zone-state" size="sm" className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allStates')}</SelectItem>
                <SelectItem value="active">{t('state.active')}</SelectItem>
                <SelectItem value="inactive">{t('state.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start lg:ml-auto lg:self-end"
            onClick={() => {
              setText('');
              setSearch(new URLSearchParams(), { replace: true });
              pages.setPage(1);
            }}
          >
            {t('filters.reset')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:items-start">
        <div className="min-w-0" onMouseLeave={() => setHovered(null)}>
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            error={error}
            onRetry={() => void (scope === 'global' ? all.refetch() : list.refetch())}
            getRowId={(zone) => zone.id}
            onRowClick={(zone) => void navigate(`/zones/${zone.id}`)}
            selectedRowId={hovered}
            pagination={
              scope === 'global' ? { mode: 'client', pageSize: 20 } : pages.adapter(list.data?.meta)
            }
            density="compact"
            ariaLabel={t('zones.tableLabel')}
            emptyState={
              filtered ? (
                <EmptyState
                  icon={Search}
                  title={t('empty.filteredTitle')}
                  description={t('empty.filteredHint')}
                  size="sm"
                />
              ) : (
                <EmptyState
                  icon={Hexagon}
                  title={t('empty.title')}
                  description={access.canCreate ? t('empty.hintWrite') : t('empty.hintRead')}
                  size="sm"
                  action={
                    access.canCreate ? (
                      <Button asChild size="sm">
                        <Link to="/zones/new">
                          <Plus /> {t('actions.create')}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        </div>
        <div className="order-first flex min-w-0 flex-col gap-2 2xl:sticky 2xl:top-4 2xl:order-none">
          <div className="relative isolate h-72 overflow-hidden rounded-xl border bg-surface shadow-xs sm:h-80 2xl:h-[30rem]">
            <MapView ariaLabel={t('zones.mapLabel')}>
              <ZonesLayer
                collection={collection}
                selectedId={hovered}
                onSelect={(id) => void navigate(`/zones/${id}`)}
              />
              <FitToBBox
                bbox={boundsOf(collection)}
                fitKey={`${kinds.join(',')}:${scope}:${active}`}
                maxZoom={10}
              />
            </MapView>
            {legendKinds.length > 0 && (
              <div className="pointer-events-none absolute bottom-9 left-3 z-10 *:pointer-events-auto">
                <MapLegend
                  title={t('map.legend')}
                  defaultOpen={false}
                  items={legendKinds.map((kind) => ({
                    label: ZONE_KIND_LABELS[kind][locale],
                    color: kindCss(kind),
                    shape: 'square' as const,
                  }))}
                />
              </div>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" aria-hidden />
              {t('map.count', {
                value: formatNumber(collection?.features.length ?? 0, i18n.language),
              })}
            </span>
            {collection?.truncated && <span className="text-warning">{t('map.truncated')}</span>}
            <span className="inline-flex items-center gap-1">
              {t('map.simplified')} <MethodInfo methodId="geo.map_simplification" />
            </span>
          </p>
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(imported) => {
          setImportOpen(false);
          void navigate('/zones/new', { state: { imported } });
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        destructive
        title={t('delete.title', { name: toDelete?.name ?? '' })}
        description={toDelete?.global ? t('delete.descriptionGlobal') : t('delete.description')}
        confirmLabel={t('common:actions.delete')}
        onConfirm={async () => {
          if (toDelete) await removeZone(toDelete, `"${toDelete.updatedAt}"`);
          setToDelete(null);
        }}
      />
      <ConflictDialog
        open={conflict !== null}
        action="delete"
        onOpenChange={(open) => !open && setConflict(null)}
        onReload={() => {
          invalidate();
          setConflict(null);
        }}
        onOverwrite={async () => {
          if (conflict) await removeZone(conflict.zone, conflict.currentEtag ?? '*');
        }}
      />
    </div>
  );
}

function boundsOf(collection: ZoneFeatureCollectionDto | undefined): number[] | null {
  if (!collection || collection.features.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minLon = Math.min(minLon, value[0]);
      maxLon = Math.max(maxLon, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLat = Math.max(maxLat, value[1]);
      return;
    }
    value.forEach(visit);
  };
  for (const feature of collection.features) {
    visit(feature.geometry.coordinates);
    feature.geometry.geometries?.forEach((member) => visit(member.coordinates));
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}
