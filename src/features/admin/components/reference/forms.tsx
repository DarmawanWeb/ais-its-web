import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import type { ReactNode } from 'react';
import { type FieldValues, type Path, type UseFormReturn, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import type {
  EngineDto,
  FuelDto,
  FuelFormulaDto,
  PortDto,
  VesselTypeDto,
} from '@/shared/api/generated/fleet/model';
import { toApiProblem } from '@/shared/api/problem';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Form } from '@/shared/ui/form';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/sonner';

import {
  useEngineMutations,
  useFuelFormulaMutations,
  useFuelMutations,
  usePortMutations,
  useVesselTypeMutations,
} from '../../api/fleet-admin';
import { checkFuelFormula } from '@/shared/lib/fuel-formula';

import { formulaProblemMessage } from '../../lib/formula-messages';
import { problemMessage } from '@/shared/api/problem-copy';
import { FormulaField, NumberField, SelectField, SourceField, TextField } from './fields';

const CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const ICONS = [
  'bulkca',
  'combin',
  'contai',
  'cruise',
  'gascar',
  'genera',
  'lngcar',
  'refrig',
  'ro-roc',
  'ro-rop',
  'ro-rov',
  'tanker',
  'unknown',
] as const;

/**
 * The fleet OpenAPI document types nullable scalars (source, code, capacityFixed, radiusM,
 * administrativeLocation) as `{ [key: string]: unknown } | null`; the bodies below send what
 * the service validates (string / number or null), so they are passed through this cast.
 */
const asBody = <T,>(body: object): T => body as T;

const num = (value: string) => Number(value);
const nullableNum = (value: string) => (value.trim() === '' ? null : Number(value));
const nullableText = (value: string) => (value.trim() === '' ? null : value.trim());
const str = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

function useSchemas() {
  const { t } = useTranslation('admin');
  const required = z.string().trim().min(1, t('reference.form.required'));
  const number = z
    .string()
    .trim()
    .refine((value) => value !== '' && Number.isFinite(Number(value)), t('reference.form.number'));
  const optionalNumber = z
    .string()
    .trim()
    .refine((value) => value === '' || Number.isFinite(Number(value)), t('reference.form.number'));
  const positive = number.refine((value) => Number(value) > 0, t('reference.form.positive'));
  const code = z.string().trim().max(64).regex(CODE, t('reference.form.code'));
  const optionalCode = z
    .string()
    .trim()
    .max(64)
    .refine((value) => value === '' || CODE.test(value), t('reference.form.code'));
  const source = z.string().max(2000, t('common.tooLong', { max: 2000 }));
  const formula = z
    .string()
    .max(500, t('common.tooLong', { max: 500 }))
    .superRefine((value, ctx) => {
      const check = checkFuelFormula(value);
      if (!check.valid) {
        ctx.addIssue({
          code: 'custom',
          message: formulaProblemMessage(t, check.issue),
        });
      }
    });
  return { required, number, optionalNumber, positive, code, optionalCode, source, formula, t };
}

/** Maps a failed save onto the form (field errors, duplicate codes) or a toast. */
function handleSaveError<T extends FieldValues>(
  t: ReturnType<typeof useTranslation>['t'],
  error: unknown,
  form: UseFormReturn<T>,
) {
  const problem = toApiProblem(error);
  if (problem.code === 'CODE_ALREADY_EXISTS') {
    form.setError('code' as Path<T>, {
      type: 'server',
      message: t('problems.CODE_ALREADY_EXISTS'),
    });
    return;
  }
  let applied = false;
  for (const fieldError of problem.errors) {
    const field = fieldError.field
      .replace(/^d\./, '')
      .replace(/^location\.coordinates\.0$/, 'lon')
      .replace(/^location\.coordinates\.1$/, 'lat');
    if (field in form.getValues()) {
      form.setError(field as Path<T>, { type: 'server', message: fieldError.message });
      applied = true;
    }
  }
  if (!applied)
    toast.error(t('reference.toasts.saveFailed'), { description: problemMessage(t, error) });
}

function ReferenceDialog({
  title,
  description,
  formId,
  pending,
  onCancel,
  children,
  wide,
}: {
  title: string;
  description: ReactNode;
  formId: string;
  pending: boolean;
  onCancel: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation('admin');
  return (
    <DialogContent
      className={wide ? 'sm:max-w-2xl' : 'sm:max-w-xl'}
      closeLabel={t('common:actions.close')}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={pending}>
          {pending ? <Spinner /> : <Save />} {t('common:actions.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export interface EditorProps<T> {
  /** The row to edit; undefined creates one. */
  value: T | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Shell({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && children}
    </Dialog>
  );
}

// --- vessel types ---------------------------------------------------------------------------

export function VesselTypeEditor({ value, open, onOpenChange }: EditorProps<VesselTypeDto>) {
  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <VesselTypeForm key={value?.id ?? 'new'} value={value} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function VesselTypeForm({ value, onDone }: { value?: VesselTypeDto; onDone: () => void }) {
  const s = useSchemas();
  const { t } = s;
  const { create, update } = useVesselTypeMutations();
  const schema = z
    .object({
      code: s.code,
      name: s.required.max(120),
      capacityUnit: z.enum(['DWT', 'GT']),
      a: s.positive,
      c: s.number,
      capacityFixed: s.optionalNumber,
      d1: s.positive,
      d2: s.positive,
      d3: s.positive,
      d4: s.positive,
      icon: z.string(),
      source: s.source,
    })
    .refine((v) => num(v.d1) < num(v.d2) && num(v.d2) < num(v.d3) && num(v.d3) < num(v.d4), {
      path: ['d4'],
      message: t('reference.vesselTypes.ddOrder'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: value?.code ?? '',
      name: value?.name ?? '',
      capacityUnit: value?.capacityUnit ?? 'DWT',
      a: str(value?.a),
      c: str(value?.c),
      capacityFixed: str(value?.capacityFixed),
      d1: str(value?.d.d1),
      d2: str(value?.d.d2),
      d3: str(value?.d.d3),
      d4: str(value?.d.d4),
      icon: value?.icon ?? 'unknown',
      source: value?.source ?? '',
    },
  });
  const submit = form.handleSubmit(async (v) => {
    const body = {
      code: v.code.trim(),
      name: v.name.trim(),
      capacityUnit: v.capacityUnit,
      a: num(v.a),
      c: num(v.c),
      capacityFixed: nullableNum(v.capacityFixed),
      d: { d1: num(v.d1), d2: num(v.d2), d3: num(v.d3), d4: num(v.d4) },
      icon: v.icon as (typeof ICONS)[number],
      source: nullableText(v.source),
    };
    try {
      if (value) await update.mutateAsync({ id: value.id, body: asBody(body) });
      else await create.mutateAsync(asBody(body));
      toast.success(t('reference.toasts.saved', { name: body.name }));
      onDone();
    } catch (error) {
      handleSaveError(t, error, form);
    }
  });
  return (
    <ReferenceDialog
      title={value ? t('reference.vesselTypes.edit') : t('reference.vesselTypes.create')}
      description={
        <span className="inline-flex items-center gap-1">
          {t('reference.vesselTypes.formHint')} <MethodInfo methodId="cii.reference_line" />
        </span>
      }
      formId="vessel-type-form"
      pending={create.isPending || update.isPending}
      onCancel={onDone}
      wide
    >
      <Form {...form}>
        <form
          id="vessel-type-form"
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            control={form.control}
            name="code"
            label={t('reference.fields.code')}
            mono
            maxLength={64}
            placeholder="bulk_carrier"
          />
          <TextField
            control={form.control}
            name="name"
            label={t('reference.fields.name')}
            maxLength={120}
          />
          <SelectField
            control={form.control}
            name="capacityUnit"
            label={t('reference.vesselTypes.capacityUnit')}
            options={[
              { value: 'DWT', label: t('reference.vesselTypes.dwt') },
              { value: 'GT', label: t('reference.vesselTypes.gt') },
            ]}
          />
          <NumberField
            control={form.control}
            name="capacityFixed"
            label={t('reference.vesselTypes.capacityFixed')}
            description={t('reference.vesselTypes.capacityFixedHint')}
          />
          <NumberField control={form.control} name="a" label={t('reference.vesselTypes.a')} />
          <NumberField control={form.control} name="c" label={t('reference.vesselTypes.c')} />
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
            {(['d1', 'd2', 'd3', 'd4'] as const).map((key) => (
              <NumberField key={key} control={form.control} name={key} label={key} />
            ))}
          </div>
          <SelectField
            control={form.control}
            name="icon"
            label={t('reference.vesselTypes.icon')}
            options={ICONS.map((icon) => ({ value: icon, label: icon }))}
          />
          <SourceField
            control={form.control}
            name="source"
            label={t('reference.fields.source')}
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </ReferenceDialog>
  );
}

// --- fuels ----------------------------------------------------------------------------------

export function FuelEditor({ value, open, onOpenChange }: EditorProps<FuelDto>) {
  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <FuelForm key={value?.id ?? 'new'} value={value} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function FuelForm({ value, onDone }: { value?: FuelDto; onDone: () => void }) {
  const s = useSchemas();
  const { t } = s;
  const { create, update } = useFuelMutations();
  const schema = z.object({
    code: s.code,
    name: s.required.max(120),
    carbonContent: s.number.refine(
      (v) => num(v) >= 0 && num(v) <= 1,
      t('reference.fuels.fraction'),
    ),
    conversionFactor: s.positive,
    density: s.positive,
    source: s.source,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: value?.code ?? '',
      name: value?.name ?? '',
      carbonContent: str(value?.carbonContent),
      conversionFactor: str(value?.conversionFactor),
      density: str(value?.density),
      source: value?.source ?? '',
    },
  });
  const submit = form.handleSubmit(async (v) => {
    const body = {
      code: v.code.trim(),
      name: v.name.trim(),
      carbonContent: num(v.carbonContent),
      conversionFactor: num(v.conversionFactor),
      density: num(v.density),
      source: nullableText(v.source),
    };
    try {
      if (value) await update.mutateAsync({ id: value.id, body: asBody(body) });
      else await create.mutateAsync(asBody(body));
      toast.success(t('reference.toasts.saved', { name: body.name }));
      onDone();
    } catch (error) {
      handleSaveError(t, error, form);
    }
  });
  return (
    <ReferenceDialog
      title={value ? t('reference.fuels.edit') : t('reference.fuels.create')}
      description={
        <span className="inline-flex items-center gap-1">
          {t('reference.fuels.formHint')} <MethodInfo methodId="emission.co2_conversion" />
        </span>
      }
      formId="fuel-form"
      pending={create.isPending || update.isPending}
      onCancel={onDone}
    >
      <Form {...form}>
        <form
          id="fuel-form"
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            control={form.control}
            name="code"
            label={t('reference.fields.code')}
            mono
            maxLength={64}
            placeholder="hfo"
          />
          <TextField
            control={form.control}
            name="name"
            label={t('reference.fields.name')}
            maxLength={120}
          />
          <NumberField
            control={form.control}
            name="conversionFactor"
            label={t('reference.fuels.cf')}
            unit="t CO₂/t"
          />
          <NumberField
            control={form.control}
            name="carbonContent"
            label={t('reference.fuels.carbon')}
            description={t('reference.fuels.carbonHint')}
          />
          <NumberField
            control={form.control}
            name="density"
            label={t('reference.fuels.density')}
            unit="t/m³"
          />
          <SourceField
            control={form.control}
            name="source"
            label={t('reference.fields.source')}
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </ReferenceDialog>
  );
}

// --- engines --------------------------------------------------------------------------------

export function EngineEditor({ value, open, onOpenChange }: EditorProps<EngineDto>) {
  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <EngineForm key={value?.id ?? 'new'} value={value} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function EngineForm({ value, onDone }: { value?: EngineDto; onDone: () => void }) {
  const s = useSchemas();
  const { t } = s;
  const { create, update } = useEngineMutations();
  const schema = z.object({
    code: s.optionalCode,
    kind: z.enum(['main', 'auxiliary']),
    name: s.required.max(120),
    rpm: s.positive,
    powerKw: s.positive,
    sfoc: s.positive,
    source: s.source,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: value?.code ?? '',
      kind: value?.kind ?? 'main',
      name: value?.name ?? '',
      rpm: str(value?.rpm),
      powerKw: str(value?.powerKw),
      sfoc: str(value?.sfoc),
      source: value?.source ?? '',
    },
  });
  const submit = form.handleSubmit(async (v) => {
    const body = {
      code: nullableText(v.code),
      kind: v.kind,
      name: v.name.trim(),
      rpm: num(v.rpm),
      powerKw: num(v.powerKw),
      sfoc: num(v.sfoc),
      source: nullableText(v.source),
    };
    try {
      if (value) await update.mutateAsync({ id: value.id, body: asBody(body) });
      else await create.mutateAsync(asBody(body));
      toast.success(t('reference.toasts.saved', { name: body.name }));
      onDone();
    } catch (error) {
      handleSaveError(t, error, form);
    }
  });
  return (
    <ReferenceDialog
      title={value ? t('reference.engines.edit') : t('reference.engines.create')}
      description={
        <span className="inline-flex items-center gap-1">
          {t('reference.engines.formHint')} <MethodInfo methodId="fuel.second_formula_me" />
        </span>
      }
      formId="engine-form"
      pending={create.isPending || update.isPending}
      onCancel={onDone}
    >
      <Form {...form}>
        <form
          id="engine-form"
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            control={form.control}
            name="name"
            label={t('reference.fields.name')}
            maxLength={120}
            className="sm:col-span-2"
          />
          <SelectField
            control={form.control}
            name="kind"
            label={t('reference.engines.kind')}
            options={[
              { value: 'main', label: t('reference.engines.kinds.main') },
              { value: 'auxiliary', label: t('reference.engines.kinds.auxiliary') },
            ]}
          />
          <TextField
            control={form.control}
            name="code"
            label={t('reference.fields.codeOptional')}
            mono
            maxLength={64}
          />
          <NumberField
            control={form.control}
            name="powerKw"
            label={t('reference.engines.power')}
            unit="kW"
          />
          <NumberField
            control={form.control}
            name="rpm"
            label={t('reference.engines.rpm')}
            unit="rpm"
          />
          <NumberField
            control={form.control}
            name="sfoc"
            label={t('reference.engines.sfoc')}
            unit="g/kWh"
          />
          <SourceField
            control={form.control}
            name="source"
            label={t('reference.fields.source')}
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </ReferenceDialog>
  );
}

// --- fuel formulas --------------------------------------------------------------------------

export function FormulaEditor({ value, open, onOpenChange }: EditorProps<FuelFormulaDto>) {
  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <FormulaForm key={value?.id ?? 'new'} value={value} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function FormulaForm({ value, onDone }: { value?: FuelFormulaDto; onDone: () => void }) {
  const s = useSchemas();
  const { t } = s;
  const { create, update } = useFuelFormulaMutations();
  const schema = z.object({
    code: s.optionalCode,
    name: s.required.max(120),
    mainEngineFormula: s.formula,
    auxiliaryEngineFormula: s.formula,
    source: s.source,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      code: value?.code ?? '',
      name: value?.name ?? '',
      mainEngineFormula: value?.mainEngineFormula ?? '',
      auxiliaryEngineFormula: value?.auxiliaryEngineFormula ?? '',
      source: value?.source ?? '',
    },
  });
  const submit = form.handleSubmit(async (v) => {
    const body = {
      code: nullableText(v.code),
      name: v.name.trim(),
      mainEngineFormula: v.mainEngineFormula.trim(),
      auxiliaryEngineFormula: v.auxiliaryEngineFormula.trim(),
      source: nullableText(v.source),
    };
    try {
      if (value) await update.mutateAsync({ id: value.id, body: asBody(body) });
      else await create.mutateAsync(asBody(body));
      toast.success(t('reference.toasts.saved', { name: body.name }));
      onDone();
    } catch (error) {
      handleSaveError(t, error, form);
    }
  });
  return (
    <ReferenceDialog
      title={value ? t('reference.formulas.edit') : t('reference.formulas.create')}
      description={
        <span className="inline-flex items-center gap-1">
          {t('reference.formulas.formHint')} <MethodInfo methodId="fuel.first_formula" />
        </span>
      }
      formId="formula-form"
      pending={create.isPending || update.isPending}
      onCancel={onDone}
      wide
    >
      <Form {...form}>
        <form
          id="formula-form"
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            control={form.control}
            name="name"
            label={t('reference.fields.name')}
            maxLength={120}
          />
          <TextField
            control={form.control}
            name="code"
            label={t('reference.fields.codeOptional')}
            mono
            maxLength={64}
          />
          <FormulaField
            control={form.control}
            name="mainEngineFormula"
            label={t('reference.formulas.main')}
            description={t('reference.formulas.grammar')}
            className="sm:col-span-2"
          />
          <FormulaField
            control={form.control}
            name="auxiliaryEngineFormula"
            label={t('reference.formulas.auxiliary')}
            className="sm:col-span-2"
          />
          <SourceField
            control={form.control}
            name="source"
            label={t('reference.fields.source')}
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </ReferenceDialog>
  );
}

// --- ports ----------------------------------------------------------------------------------

export function PortEditor({ value, open, onOpenChange }: EditorProps<PortDto>) {
  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <PortForm key={value?.id ?? 'new'} value={value} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function PortForm({ value, onDone }: { value?: PortDto; onDone: () => void }) {
  const s = useSchemas();
  const { t } = s;
  const { create, update } = usePortMutations();
  const schema = z.object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{2,16}$/, t('reference.ports.codeRule')),
    name: s.required.max(120),
    administrativeLocation: z.string().trim().max(64),
    lat: s.number.refine((v) => num(v) >= -90 && num(v) <= 90, t('reference.ports.lat')),
    lon: s.number.refine((v) => num(v) >= -180 && num(v) <= 180, t('reference.ports.lon')),
    radiusM: s.optionalNumber.refine((v) => v === '' || num(v) > 0, t('reference.form.positive')),
    source: s.source,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: value?.code ?? '',
      name: value?.name ?? '',
      administrativeLocation: value?.administrativeLocation ?? '',
      lat: str(value?.location.coordinates[1]),
      lon: str(value?.location.coordinates[0]),
      radiusM: str(value?.radiusM),
      source: value?.source ?? '',
    },
  });
  const submit = form.handleSubmit(async (v) => {
    const body = {
      code: v.code.trim(),
      name: v.name.trim(),
      administrativeLocation: nullableText(v.administrativeLocation),
      location: { type: 'Point' as const, coordinates: [num(v.lon), num(v.lat)] },
      radiusM: nullableNum(v.radiusM),
      source: nullableText(v.source),
    };
    try {
      if (value) await update.mutateAsync({ id: value.id, body: asBody(body) });
      else await create.mutateAsync(asBody(body));
      toast.success(t('reference.toasts.saved', { name: body.name }));
      onDone();
    } catch (error) {
      handleSaveError(t, error, form);
    }
  });
  return (
    <ReferenceDialog
      title={value ? t('reference.ports.edit') : t('reference.ports.create')}
      description={t('reference.ports.formHint')}
      formId="port-form"
      pending={create.isPending || update.isPending}
      onCancel={onDone}
    >
      <Form {...form}>
        <form
          id="port-form"
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <TextField
            control={form.control}
            name="name"
            label={t('reference.fields.name')}
            maxLength={120}
          />
          <TextField
            control={form.control}
            name="code"
            label={t('reference.ports.code')}
            mono
            maxLength={16}
            placeholder="IDBTM"
          />
          <NumberField
            control={form.control}
            name="lat"
            label={t('common:domain.latitude')}
            unit="°"
          />
          <NumberField
            control={form.control}
            name="lon"
            label={t('common:domain.longitude')}
            unit="°"
          />
          <NumberField
            control={form.control}
            name="radiusM"
            label={t('reference.ports.radius')}
            unit="m"
          />
          <TextField
            control={form.control}
            name="administrativeLocation"
            label={t('reference.ports.admin')}
            mono
            maxLength={64}
            placeholder="21.71.01.1001"
          />
          <SourceField
            control={form.control}
            name="source"
            label={t('reference.fields.source')}
            className="sm:col-span-2"
          />
        </form>
      </Form>
    </ReferenceDialog>
  );
}
