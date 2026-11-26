import { VESSEL_STATUS_LABELS, VESSEL_STATUSES } from '@darmawanweb/ais-its-contracts/domain';
import { zodResolver } from '@hookform/resolvers/zod';
import { Cog, Fuel, Info, MapPin, Ruler, Save, Ship } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { type Resolver, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate } from 'react-router';

import type { RegistryParticularsDto, VesselDetailDto } from '@/shared/api/generated/fleet/model';
import {
  useVesselsControllerCreate,
  useVesselsControllerRemovePhoto,
  useVesselsControllerReplaceDimensions,
  useVesselsControllerReplaceEngines,
  useVesselsControllerReplacePorts,
  useVesselsControllerUpdate,
  useVesselsControllerUploadPhoto,
} from '@/shared/api/generated/fleet/vessels/vessels';
import { type ApiProblem, toApiProblem } from '@/shared/api/problem';
import { ConfirmDialog } from '@/shared/domain-ui/confirm-dialog';
import { ErrorState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/shared/ui/form';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { Switch } from '@/shared/ui/switch';

import type { ReferenceData } from '../api/reference-data';
import { useVesselCache } from '../api/vessels';
import { useAppLanguage } from '@/shared/i18n';
import { usePendingPhoto } from '../hooks/use-pending-photo';
import { localizeProblem, problemSummary } from '@/shared/api/problem-copy';
import { FIELD_OF_CONFLICT, fleetProblemCopies, photoProblemCopies } from '../lib/problems';
import { registryPrefill } from '../lib/registry';
import { flagName } from '../lib/vessel';
import {
  changedSections,
  createVesselFormSchema,
  formFieldOfProblem,
  toCreateDto,
  toDimensionsDto,
  toEngineRows,
  toUpdateDto,
  vesselFormDefaults,
  type VesselFormValues,
  type VesselWriteStep,
} from '../lib/vessel-form';
import { EngineFields } from './engine-fields';
import { FormSection, NumberField, SelectField, TextField } from './form-fields';
import { FormulaField } from './formula-field';
import { PhotoDropzone } from './photo-dropzone';
import { PortsField } from './ports-field';
import { RegistryLookupDialog } from './registry-lookup-dialog';

const SECTIONS = [
  { id: 'identity', icon: Ship },
  { id: 'type', icon: Fuel },
  { id: 'dimensions', icon: Ruler },
  { id: 'engines', icon: Cog },
  { id: 'ports', icon: MapPin },
] as const;

function TypeInfo({ reference }: { reference: ReferenceData }) {
  const { t, i18n } = useTranslation('vessels');
  const typeId = useWatch<VesselFormValues, 'typeId'>({ name: 'typeId' });
  const fuelId = useWatch<VesselFormValues, 'fuelId'>({ name: 'fuelId' });
  const type = reference.types.find((item) => item.id === typeId);
  const fuel = reference.fuels.find((item) => item.id === fuelId);
  const n = (value: number, digits = 3) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: digits });
  if (!type && !fuel) return null;
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/15 p-4 text-xs sm:grid-cols-2">
      {type && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 font-medium text-foreground">
            {t('form.typeParams')} <MethodInfo methodId="cii.reference_line" />
          </p>
          <p className="text-muted-foreground">
            {t('form.typeParamsValue', {
              unit: type.capacityUnit,
              a: n(type.a, 0),
              c: n(type.c),
            })}
          </p>
          <p className="font-mono text-muted-foreground">
            d = {n(type.d.d1)} · {n(type.d.d2)} · {n(type.d.d3)} · {n(type.d.d4)}
          </p>
        </div>
      )}
      {fuel && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 font-medium text-foreground">
            {fuel.name} <MethodInfo methodId="emission.co2_conversion" />
          </p>
          <p className="text-muted-foreground">
            {t('form.fuelParams', { cf: n(fuel.conversionFactor), density: n(fuel.density) })}
          </p>
        </div>
      )}
    </div>
  );
}

function FlagHint() {
  const { i18n } = useTranslation();
  const flag = useWatch<VesselFormValues, 'flag'>({ name: 'flag' });
  const name = flag.length === 2 ? flagName(flag, i18n.language) : null;
  return name ? <>{name}</> : null;
}

/**
 * Create / edit form of a vessel. Create: `POST /vessels` (dimensions, engines and ports in one
 * body) then the photo. Edit: `PATCH` of the changed identity fields and a `PUT` per changed
 * section (dimensions, engines, ports); the photo is uploaded/removed at once.
 */
export function VesselEditor({
  vessel,
  reference,
}: {
  vessel?: VesselDetailDto;
  reference: ReferenceData;
}) {
  const { t } = useTranslation('vessels');
  const locale = useAppLanguage();
  const navigate = useNavigate();
  const cache = useVesselCache();
  const copies = useMemo(() => fleetProblemCopies(t), [t]);
  const photoCopies = useMemo(() => photoProblemCopies(t), [t]);
  const schema = useMemo(() => createVesselFormSchema(t), [t]);
  const form = useForm<VesselFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<VesselFormValues>,
    defaultValues: vesselFormDefaults(vessel),
    mode: 'onTouched',
  });
  const [submitError, setSubmitError] = useState<ApiProblem | null>(null);
  const [confirmPhotoRemoval, setConfirmPhotoRemoval] = useState(false);
  const leaving = useRef(false);
  const pending = usePendingPhoto();

  const create = useVesselsControllerCreate();
  const update = useVesselsControllerUpdate();
  const dimensions = useVesselsControllerReplaceDimensions();
  const engines = useVesselsControllerReplaceEngines();
  const ports = useVesselsControllerReplacePorts();
  const uploadPhoto = useVesselsControllerUploadPhoto();
  const removePhoto = useVesselsControllerRemovePhoto();

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current &&
      form.formState.isDirty &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  const typeId = useWatch({ control: form.control, name: 'typeId' });
  const unitOfType = reference.types.find((type) => type.id === typeId)?.capacityUnit ?? 'DWT/GT';
  const name = useWatch({ control: form.control, name: 'name' });

  const fail = (error: unknown, step: VesselWriteStep, values: VesselFormValues) => {
    const problem = toApiProblem(error);
    let first: string | null = null;
    for (const fieldError of problem.errors) {
      const path = formFieldOfProblem(fieldError.field, step, values);
      if (!path) continue;
      form.setError(path as keyof VesselFormValues, { message: fieldError.message });
      first ??= path;
    }
    const conflict = FIELD_OF_CONFLICT[problem.code];
    if (conflict) {
      form.setError(conflict as keyof VesselFormValues, { message: copies[problem.code]?.title });
      first ??= conflict;
    }
    setSubmitError(localizeProblem(problem, copies) ?? problem);
    if (first) form.setFocus(first as keyof VesselFormValues);
  };

  const finish = (saved: VesselDetailDto, message: string) => {
    leaving.current = true;
    toast.success(message);
    void navigate(`/vessels/${saved.mmsi}`);
  };

  const onSubmit = async (values: VesselFormValues) => {
    setSubmitError(null);
    if (!vessel) {
      let created: VesselDetailDto;
      try {
        created = await create.mutateAsync({ data: toCreateDto(values) });
      } catch (error) {
        fail(error, 'create', values);
        return;
      }
      cache.put(created);
      if (pending.photo) {
        try {
          created = await uploadPhoto.mutateAsync({
            id: created.id,
            data: { file: pending.photo.file },
          });
          cache.put(created);
        } catch (error) {
          toast.warning(t('photo.uploadFailedAfterCreate'), {
            description: problemSummary(error, photoCopies),
          });
        }
      }
      finish(created, t('form.created', { name: created.name }));
      return;
    }
    let current = vessel;
    const patch = toUpdateDto(values, vessel);
    const sections = changedSections(values, vessel);
    const steps: { step: VesselWriteStep; run: () => Promise<VesselDetailDto> }[] = [];
    if (Object.keys(patch).length > 0) {
      steps.push({
        step: 'identity',
        run: () => update.mutateAsync({ id: vessel.id, data: patch }),
      });
    }
    if (sections.dimensions) {
      steps.push({
        step: 'dimensions',
        run: () => dimensions.mutateAsync({ id: vessel.id, data: toDimensionsDto(values) }),
      });
    }
    if (sections.engines) {
      steps.push({
        step: 'engines',
        run: () => engines.mutateAsync({ id: vessel.id, data: toEngineRows(values) }),
      });
    }
    if (sections.ports) {
      steps.push({
        step: 'ports',
        run: () => ports.mutateAsync({ id: vessel.id, data: values.portIds }),
      });
    }
    if (steps.length === 0) {
      finish(vessel, t('form.unchanged'));
      return;
    }
    for (const { step, run } of steps) {
      try {
        current = await run();
      } catch (error) {
        if (current !== vessel) cache.put(current, vessel.mmsi);
        fail(error, step, values);
        return;
      }
    }
    cache.put(current, vessel.mmsi);
    form.reset(vesselFormDefaults(current));
    finish(current, t('form.saved', { name: current.name }));
  };

  const onPhotoSelected = async (file: File) => {
    if (!vessel) {
      pending.select(file);
      return;
    }
    try {
      const saved = await uploadPhoto.mutateAsync({ id: vessel.id, data: { file } });
      cache.put(saved);
      toast.success(t('photo.uploaded'));
    } catch (error) {
      toast.error(t('photo.uploadFailed'), { description: problemSummary(error, photoCopies) });
    }
  };

  const onRegistryPick = (entry: RegistryParticularsDto) => {
    const prefill = registryPrefill(entry, reference.types);
    for (const { field, value } of prefill) {
      form.setValue(field, value, { shouldDirty: true, shouldValidate: true });
    }
    toast.success(t('registry.applied', { count: prefill.length, name: entry.name }));
  };

  const saving =
    form.formState.isSubmitting ||
    create.isPending ||
    update.isPending ||
    dimensions.isPending ||
    engines.isPending ||
    ports.isPending;
  const photoUrl = vessel ? vessel.photoUrl : (pending.photo?.url ?? null);

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        aria-label={vessel ? t('form.editLabel', { name: vessel.name }) : t('form.createLabel')}
      >
        <div className="grid min-w-0 content-start gap-6">
          {submitError && (
            <div
              className="rounded-xl border border-danger/40 bg-danger/5"
              data-testid="vessel-form-error"
            >
              <ErrorState error={submitError} size="sm" />
            </div>
          )}
          <FormSection
            id="identity"
            title={t('form.sections.identity')}
            description={t('form.sections.identityHint')}
            actions={!vessel ? <RegistryLookupDialog onPick={onRegistryPick} /> : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <TextField
                name="name"
                label={t('fields.name')}
                maxLength={120}
                className="sm:col-span-2 xl:col-span-1"
              />
              <NumberField
                name="mmsi"
                label={t('fields.mmsi')}
                step="1"
                description={t('form.mmsiHint')}
              />
              <TextField
                name="imo"
                label={t('fields.imo')}
                mono
                maxLength={11}
                description={t('form.imoHint')}
              />
              <TextField
                name="flag"
                label={t('fields.flag')}
                mono
                maxLength={2}
                autoCapitalize="characters"
                description={<FlagHint />}
                placeholder="ID"
              />
              <NumberField name="builtYear" label={t('fields.builtYear')} step="1" />
              <SelectField
                name="status"
                label={t('fields.status')}
                options={VESSEL_STATUSES.map((status) => ({
                  value: status,
                  label: VESSEL_STATUS_LABELS[status][locale],
                }))}
              />
              <NumberField
                name="annualVoyagePercentage"
                label={t('fields.annualVoyagePercentage')}
                unit="%"
                description={t('form.voyageHint')}
                hint={<MethodInfo methodId="seemp.reduction_type1_operational_share" />}
              />
            </div>
          </FormSection>

          <FormSection
            id="type"
            title={t('form.sections.type')}
            description={t('form.sections.typeHint')}
          >
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="typeId"
                  label={t('fields.type')}
                  placeholder={t('form.selectType')}
                  options={reference.types.map((type) => ({ value: type.id, label: type.name }))}
                />
                <SelectField
                  name="fuelId"
                  label={t('fields.fuel')}
                  placeholder={t('form.selectFuel')}
                  options={reference.fuels.map((fuel) => ({ value: fuel.id, label: fuel.name }))}
                />
              </div>
              <TypeInfo reference={reference} />
              <FormulaField formulas={reference.formulas} />
            </div>
          </FormSection>

          <FormSection
            id="dimensions"
            title={t('form.sections.dimensions')}
            description={t('form.sections.dimensionsHint')}
          >
            <div className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  name="dimensions.capacity"
                  label={t('fields.capacity', { unit: unitOfType })}
                  hint={<MethodInfo methodId="cii.reference_line" />}
                />
                <NumberField name="dimensions.gt" label={t('fields.gt')} />
                <NumberField name="dimensions.dwt" label={t('fields.dwt')} unit="t" />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <NumberField name="dimensions.loa" label={t('fields.loa')} unit="m" />
                <NumberField name="dimensions.lpp" label={t('fields.lpp')} unit="m" />
                <NumberField name="dimensions.lwl" label={t('fields.lwl')} unit="m" />
                <NumberField name="dimensions.b" label={t('fields.b')} unit="m" />
                <NumberField name="dimensions.t" label={t('fields.t')} unit="m" />
                <NumberField name="dimensions.vs" label={t('fields.vs')} unit="kn" />
              </div>
              <div className="grid gap-3">
                <p className="flex items-center gap-1 text-sm font-medium">
                  {t('overview.hull')} <MethodInfo methodId="resistance.hull_volumes_and_lengths" />
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {(['cb', 'cbnsp', 'cp', 'cm', 'cwp', 'cstern'] as const).map((key) => (
                    <NumberField key={key} name={`dimensions.${key}`} label={t(`fields.${key}`)} />
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                <p className="text-sm font-medium">{t('overview.rudder')}</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(['c1', 'c2', 'c3', 'c5'] as const).map((key) => (
                    <NumberField key={key} name={`dimensions.${key}`} label={t(`fields.${key}`)} />
                  ))}
                </div>
              </div>
              <FormField
                control={form.control}
                name="dimensions.bulbousBow"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border px-4 py-3">
                    <div className="space-y-0.5">
                      <FormLabel>{t('fields.bulbousBow')}</FormLabel>
                      <p className="text-xs text-muted-foreground">{t('form.bulbousBowHint')}</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection
            id="engines"
            title={t('form.sections.engines')}
            description={t('form.sections.enginesHint')}
          >
            <EngineFields mainEngines={reference.mainEngines} auxEngines={reference.auxEngines} />
          </FormSection>

          <FormSection
            id="ports"
            title={t('form.sections.ports')}
            description={t('form.sections.portsHint')}
          >
            <PortsField ports={reference.ports} />
          </FormSection>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-elevated/95 px-4 py-3 shadow-elevated backdrop-blur">
            <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
              {form.formState.isDirty ? t('form.unsaved') : t('form.noChanges')}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void navigate(vessel ? `/vessels/${vessel.mmsi}` : '/vessels')}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={saving} data-testid="vessel-save">
              <Save />{' '}
              {saving ? t('common:actions.saving') : vessel ? t('form.save') : t('form.create')}
            </Button>
          </div>
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start">
          <section
            aria-labelledby="vessel-photo-title"
            className="rounded-xl border bg-surface p-4 shadow-xs"
          >
            <h2 id="vessel-photo-title" className="mb-3 text-sm font-semibold">
              {t('photo.title')}
            </h2>
            <PhotoDropzone
              name={name || t('form.newVessel')}
              previewUrl={photoUrl}
              busy={uploadPhoto.isPending || removePhoto.isPending}
              onSelect={(file) => void onPhotoSelected(file)}
              onRemove={vessel ? () => setConfirmPhotoRemoval(true) : () => pending.select(null)}
            />
            {!vessel && pending.photo && (
              <p className="mt-2 text-xs text-muted-foreground">{t('photo.afterCreate')}</p>
            )}
          </section>
          <nav
            aria-label={t('form.sectionsNav')}
            className="hidden rounded-xl border bg-surface p-2 shadow-xs lg:block"
          >
            <ul className="grid gap-0.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <section.icon className="size-4" aria-hidden />
                    {t(`form.sections.${section.id}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <p className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('form.tenancyNote')}
          </p>
        </aside>
      </form>

      <ConfirmDialog
        destructive
        open={confirmPhotoRemoval}
        onOpenChange={setConfirmPhotoRemoval}
        title={t('photo.removeTitle')}
        description={t('photo.removeDescription')}
        confirmLabel={t('photo.remove')}
        onConfirm={async () => {
          if (!vessel) return;
          try {
            await removePhoto.mutateAsync({ id: vessel.id });
            cache.put({ ...vessel, photoUrl: null });
            toast.success(t('photo.removed'));
          } catch (error) {
            toast.error(t('photo.removeFailed'), {
              description: problemSummary(error, photoCopies),
            });
          }
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        title={t('form.leaveTitle')}
        description={t('form.leaveDescription')}
        confirmLabel={t('form.leave')}
        destructive
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </Form>
  );
}

/** Placeholder of the editor while the reference data loads. */
export function VesselEditorSkeleton() {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      aria-busy
    >
      <div className="grid gap-6">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
