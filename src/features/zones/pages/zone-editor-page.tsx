import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, PanelRight, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import type { UpdateZoneDto } from '@/shared/api/generated/geo/model';
import { toApiProblem, type ApiProblem } from '@/shared/api/problem';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { MapPageLayout } from '@/shared/map';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import {
  createZone,
  deleteZone,
  fetchZone,
  updateZone,
  useInvalidateZones,
  useZone,
  type VersionedZone,
} from '../api/zones-api';
import { ConflictDialog } from '../components/conflict-dialog';
import { DrawToolbar } from '../components/draw-toolbar';
import { ImportDialog, type ImportedZone } from '../components/import-dialog';
import { type DrawControls, ZoneEditorMap } from '../components/maps/zone-editor-map';
import { ZoneForm } from '../components/zone-form';
import type { EditorMode } from '../hooks/use-terra-draw';
import { useZoneAccess } from '../hooks/use-zone-access';
import {
  combineGeometries,
  partsBBox,
  type SimpleGeometry,
  splitGeometry,
} from '../lib/draw-geometry';
import { toolsForKind, validateZoneGeometry, vertexCount } from '../lib/geometry-rules';
import { downloadGeoJson, zoneToFeature } from '../lib/geojson-io';
import {
  currentEtagOf,
  fieldOfPath,
  zoneProblemMessage,
  type ZoneFormField,
} from '../lib/problems';
import {
  formValuesOf,
  slugifyCode,
  suggestedBuffer,
  toCreateBody,
  toUpdateBody,
  zoneFormSchema,
  type ZoneFormValues,
} from '../lib/zone-model';

/** Width from which the shared map layout shows the side panel beside the map. */
const DESKTOP_QUERY = '(min-width: 1024px)';

const FORM_FIELDS: ReadonlySet<ZoneFormField> = new Set([
  'code',
  'name',
  'kind',
  'bufferM',
  'source',
]);

function initialMode(
  kind: ZoneFormValues['kind'],
  isNew: boolean,
  readOnly: boolean,
  hasGeometry: boolean,
): EditorMode {
  if (readOnly) return 'static';
  if (!isNew || hasGeometry) return 'select';
  return toolsForKind(kind)[0] ?? 'select';
}

/**
 * The editor of one zone (new or loaded): the geometry drawn with terra-draw, the properties
 * form, saving with `If-Match` and the conflict dialog. Remounted (key) when the zone is
 * reloaded, so its state always starts from one version.
 */
function ZoneEditor({
  versioned,
  imported,
  onReloaded,
}: {
  versioned: VersionedZone | null;
  imported: ImportedZone | null;
  onReloaded: () => Promise<void>;
}) {
  const { t } = useTranslation('zones');
  const navigate = useNavigate();
  const access = useZoneAccess();
  const invalidate = useInvalidateZones();
  const isNew = versioned === null;
  const zone = versioned?.zone ?? null;
  const readOnly = isNew ? !access.canCreate : !access.canWriteZone(zone!);
  const readOnlyReason = !readOnly
    ? null
    : !access.canWrite
      ? t('readOnly.noPermission')
      : zone?.global
        ? t('readOnly.global')
        : t('readOnly.otherOrg');

  const [version, setVersion] = useState(versioned?.etag ?? null);
  const [saved, setSaved] = useState(zone);
  const importedDefaults = imported
    ? {
        ...(imported.properties.name ? { name: imported.properties.name } : {}),
        ...(imported.properties.code || imported.properties.name
          ? { code: imported.properties.code ?? slugifyCode(imported.properties.name ?? '') }
          : {}),
        ...(imported.properties.kind ? { kind: imported.properties.kind } : {}),
        ...(imported.properties.bufferM !== undefined
          ? { bufferM: String(imported.properties.bufferM) }
          : {}),
        ...(imported.properties.source ? { source: imported.properties.source } : {}),
      }
    : {};
  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: formValuesOf(zone, importedDefaults),
  });
  const kind = form.watch('kind');
  const bufferText = form.watch('bufferM');
  const bufferM = Number(bufferText) || 0;

  const [parts, setParts] = useState<SimpleGeometry[]>(() =>
    splitGeometry(zone?.geometry ?? imported?.geometry),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(zone?.geometry ?? null));
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<EditorMode>(() =>
    initialMode(kind, isNew, readOnly, parts.length > 0),
  );
  const [hasSelection, setHasSelection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [conflict, setConflict] = useState<{
    action: 'save' | 'delete';
    currentEtag: string | null;
    body?: UpdateZoneDto;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // The properties open beside the map on desktop; on phones they are a modal drawer, so the
  // map and the drawing tools come first and "Properties" opens the form.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const controlsRef = useRef<DrawControls | null>(null);
  const leaving = useRef(false);

  const geometry = useMemo(() => combineGeometries(parts), [parts]);
  const geometryChanged = JSON.stringify(geometry) !== baseline;
  const issues = useMemo(
    () => validateZoneGeometry(kind, geometry, bufferM),
    [kind, geometry, bufferM],
  );
  const allowedTools = useMemo(() => toolsForKind(kind), [kind]);
  const dirty = form.formState.isDirty || geometryChanged;
  const [fitBBox] = useState(() => zone?.bbox ?? partsBBox(parts));

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // A tool the new kind does not allow falls back to editing.
  if (mode !== 'select' && mode !== 'static' && !allowedTools.includes(mode)) setMode('select');

  const replaceParts = useCallback((next: SimpleGeometry[]) => {
    setParts(next);
    setRevision((value) => value + 1);
  }, []);

  const onPartsChange = useCallback(
    (next: SimpleGeometry[]) => {
      setParts(next);
      const combined = combineGeometries(next);
      const suggested = suggestedBuffer(combined, Number(form.getValues('bufferM')) || 0);
      if (suggested !== (Number(form.getValues('bufferM')) || 0)) {
        form.setValue('bufferM', String(suggested), { shouldDirty: true });
        toast.info(t('editor.bufferSet', { value: suggested }));
      }
    },
    [form, t],
  );

  const problemText = problem ? zoneProblemMessage(problem) : null;
  const serverIssue =
    problemText?.field === 'geometry' ? t(`problems.${problemText.key}`, problemText.params) : null;

  const handleProblem = (cause: unknown, action: 'save' | 'delete', body?: UpdateZoneDto) => {
    const apiProblem = toApiProblem(cause);
    if (apiProblem.code === 'ZONE_VERSION_CONFLICT') {
      setConflict({ action, currentEtag: currentEtagOf(apiProblem), ...(body ? { body } : {}) });
      return;
    }
    setProblem(apiProblem);
    const message = zoneProblemMessage(apiProblem);
    for (const error of apiProblem.errors) {
      const field = fieldOfPath(error.field);
      if (field && FORM_FIELDS.has(field))
        form.setError(field as keyof ZoneFormValues, { message: error.message });
    }
    if (message.field && FORM_FIELDS.has(message.field)) {
      form.setError(message.field as keyof ZoneFormValues, {
        message: t(`problems.${message.key}`, message.params),
      });
    }
    toast.error(action === 'save' ? t('toast.saveFailed') : t('toast.deleteFailed'), {
      description: t(`problems.${message.key}`, message.params),
    });
  };

  const applySaved = (next: VersionedZone) => {
    setSaved(next.zone);
    setVersion(next.etag);
    setBaseline(JSON.stringify(next.zone.geometry));
    form.reset(formValuesOf(next.zone));
    invalidate(next);
  };

  const sendUpdate = async (body: UpdateZoneDto, ifMatch: string) => {
    const next = await updateZone(saved!.id, body, ifMatch);
    applySaved(next);
    setConflict(null);
    toast.success(t('toast.saved', { name: next.zone.name }));
  };

  const submit = form.handleSubmit(async (values) => {
    setProblem(null);
    if (!geometry || issues.length > 0) {
      toast.error(t('toast.fixGeometry'), {
        description: issues[0] ? t(`issues.${issues[0].code}`, issues[0].params ?? {}) : undefined,
      });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createZone(toCreateBody(values, geometry, access.canWriteGlobal));
        invalidate(created);
        toast.success(t('toast.created', { name: created.zone.name }));
        leaving.current = true;
        void navigate(`/zones/${created.zone.id}`, { replace: true });
        return;
      }
      const body = toUpdateBody(saved!, values, geometry, geometryChanged);
      if (Object.keys(body).length === 0) {
        toast.info(t('toast.noChanges'));
        form.reset(values);
        return;
      }
      try {
        await sendUpdate(body, version ?? `"${saved!.updatedAt}"`);
      } catch (cause) {
        handleProblem(cause, 'save', body);
      }
    } catch (cause) {
      handleProblem(cause, 'save');
    } finally {
      setSaving(false);
    }
  });

  const remove = async (ifMatch: string) => {
    if (!saved) return;
    try {
      await deleteZone(saved.id, ifMatch);
      invalidate({ deletedId: saved.id });
      toast.success(t('toast.deleted', { name: saved.name }));
      leaving.current = true;
      setConflict(null);
      void navigate('/zones', { replace: true });
    } catch (cause) {
      handleProblem(cause, 'delete');
    }
  };

  const overwrite = async () => {
    if (!conflict || !saved) return;
    const currentEtag = conflict.currentEtag ?? (await fetchZone(saved.id)).etag;
    if (conflict.action === 'delete') return remove(currentEtag);
    try {
      await sendUpdate(conflict.body ?? {}, currentEtag);
    } catch (cause) {
      handleProblem(cause, 'save', conflict.body);
    }
  };

  const title = isNew ? t('editor.newTitle') : (saved?.name ?? t('editor.title'));
  const exportCurrent = () => {
    if (!geometry) return;
    const base = saved ?? null;
    const values = form.getValues();
    const feature = base
      ? { ...zoneToFeature(base), geometry }
      : {
          type: 'Feature',
          geometry,
          properties: {
            name: values.name,
            code: values.code,
            kind: values.kind,
            bufferM: Number(values.bufferM) || 0,
          },
        };
    downloadGeoJson(values.code || 'zone', feature);
  };

  return (
    <>
      <MapPageLayout
        title={title}
        map={
          <ZoneEditorMap
            parts={parts}
            revision={revision}
            mode={mode}
            bufferM={bufferM}
            excludeId={saved?.id ?? null}
            fitBBox={fitBBox}
            fitKey={saved?.id ?? 'new'}
            onPartsChange={onPartsChange}
            onSelectionChange={setHasSelection}
            controlsRef={controlsRef}
          />
        }
        topLeft={
          <>
            <div className="glass-panel flex items-center gap-2 rounded-xl border px-2 py-1.5 shadow-panel">
              <Button asChild variant="ghost" size="icon-sm" aria-label={t('editor.back')}>
                <Link to="/zones">
                  <ArrowLeft />
                </Link>
              </Button>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
              {!panelOpen && (
                <Button variant="subtle" size="sm" onClick={() => setPanelOpen(true)}>
                  <PanelRight /> {t('editor.properties')}
                </Button>
              )}
            </div>
            <DrawToolbar
              mode={mode}
              onModeChange={setMode}
              allowedTools={allowedTools}
              readOnly={readOnly}
              hasSelection={hasSelection}
              geometryType={geometry?.type ?? null}
              vertexCount={vertexCount(geometry)}
              issues={issues.filter(
                (issue) =>
                  issue.code !== 'GEOMETRY_REQUIRED' || !isNew || form.formState.isSubmitted,
              )}
              serverIssue={serverIssue}
              onDeleteSelected={() => {
                if (!controlsRef.current?.deleteSelected()) toast.info(t('editor.nothingSelected'));
              }}
              onClear={() => setConfirmClear(true)}
              onImport={() => setImportOpen(true)}
              onExport={exportCurrent}
              onAddPoint={(lon, lat) => {
                const next = [...parts, { type: 'Point' as const, coordinates: [lon, lat] }];
                replaceParts(next);
                onPartsChange(next);
              }}
            />
          </>
        }
        sidePanel={
          <ZoneForm
            form={form}
            isNew={isNew}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
            allowGlobal={access.canWriteGlobal}
            zone={saved}
            etag={version}
            saving={saving}
            dirty={dirty}
            problem={
              problemText && problemText.field !== 'geometry' && !problemText.conflict
                ? {
                    title: t('toast.saveFailed'),
                    description: t(`problems.${problemText.key}`, problemText.params),
                  }
                : null
            }
            onSubmit={() => void submit()}
            onDelete={() => setConfirmDelete(true)}
            onExport={exportCurrent}
            canDelete={!isNew && !readOnly}
          />
        }
        sidePanelTitle={t('editor.properties')}
        sidePanelOpen={panelOpen}
        onSidePanelOpenChange={setPanelOpen}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(result) => {
          setImportOpen(false);
          replaceParts(splitGeometry(result.geometry));
          onPartsChange(splitGeometry(result.geometry));
          if (isNew) {
            if (result.properties.name && !form.getValues('name'))
              form.setValue('name', result.properties.name, { shouldDirty: true });
            if (!form.getValues('code') && (result.properties.code || result.properties.name)) {
              form.setValue(
                'code',
                result.properties.code ?? slugifyCode(result.properties.name ?? ''),
                {
                  shouldDirty: true,
                },
              );
            }
            if (result.properties.kind)
              form.setValue('kind', result.properties.kind, { shouldDirty: true });
          }
          setMode('select');
          toast.success(t('import.loaded', { vertices: result.vertexCount }));
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        destructive
        title={t('editor.clearTitle')}
        description={t('editor.clearDescription')}
        confirmLabel={t('editor.clear')}
        onConfirm={() => {
          replaceParts([]);
          setMode(allowedTools[0] ?? 'select');
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={t('delete.title', { name: saved?.name ?? '' })}
        description={saved?.global ? t('delete.descriptionGlobal') : t('delete.description')}
        confirmLabel={t('common:actions.delete')}
        onConfirm={() => remove(version ?? `"${saved?.updatedAt ?? ''}"`)}
      />
      <ConflictDialog
        open={conflict !== null}
        action={conflict?.action ?? 'save'}
        onOpenChange={(open) => !open && setConflict(null)}
        onReload={async () => {
          leaving.current = true;
          setConflict(null);
          await onReloaded();
        }}
        onOverwrite={overwrite}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
        destructive
        title={t('leave.title')}
        description={t('leave.description')}
        confirmLabel={t('leave.confirm')}
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </>
  );
}

/**
 * Zone editor route (`/zones/new`, `/zones/:id`): loads the zone with its `ETag`, shows the
 * loading and error states, and mounts the editor (again after a reload).
 */
export function ZoneEditorPage() {
  const { t } = useTranslation('zones');
  const { id } = useParams();
  const location = useLocation();
  const imported = (location.state as { imported?: ImportedZone } | null)?.imported ?? null;
  const query = useZone(id);
  const [reloadKey, setReloadKey] = useState(0);

  if (!id)
    return (
      <ZoneEditor
        key="new"
        versioned={null}
        imported={imported}
        onReloaded={() => Promise.resolve()}
      />
    );

  if (query.isPending) {
    return (
      <div className="relative flex h-full w-full" aria-busy>
        <h1 className="sr-only">{t('editor.title')}</h1>
        <Skeleton className="h-full flex-1 rounded-none" />
        <div className="hidden w-[400px] space-y-3 border-l p-4 lg:block">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    const notFound = query.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <h1 className="sr-only">{t('editor.title')}</h1>
        <ErrorState
          error={query.error}
          title={notFound ? t('editor.notFound') : undefined}
          description={notFound ? t('editor.notFoundHint') : undefined}
          onRetry={notFound ? undefined : () => void query.refetch()}
          action={
            <Button asChild variant="outline">
              <Link to="/zones">
                <ArrowLeft /> {t('editor.back')}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <>
      <ZoneEditor
        key={`${id}:${reloadKey}`}
        versioned={query.data}
        imported={null}
        onReloaded={async () => {
          await query.refetch();
          setReloadKey((value) => value + 1);
          toast.info(t('toast.reloaded'));
        }}
      />
      {query.isFetching && (
        <span className="sr-only" role="status">
          <RefreshCw /> {t('common:status.loading')}
        </span>
      )}
    </>
  );
}
