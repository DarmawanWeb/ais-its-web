import type { TFunction } from 'i18next';
import { VESSEL_STATUSES, type VesselStatus } from '@darmawanweb/ais-its-contracts/domain';
import { z } from 'zod';

import type {
  CreateVesselDto,
  UpdateVesselDto,
  VesselDetailDto,
  VesselDimensionsDto,
  VesselEngineInputDto,
} from '@/shared/api/generated/fleet/model';

/**
 * Vessel form (create / edit) mirroring the fleet DTO constraints
 * (`services/fleet/src/modules/vessels/dto/vessel-input.dto.ts`): MMSI 9 digits, IMO 7 digits,
 * flag ISO alpha-2, built year 1800–2200, voyage share 0–100 %, the dimension bounds of
 * `VesselDimensionsDto`, ≤ 16 engine rows with one main row, ≤ 50 unique ports.
 */

export const MAX_VESSEL_ENGINES = 16;
export const MAX_VESSEL_PORTS = 50;
export const IMO_PATTERN = /^\d{7}$/;
export const FLAG_PATTERN = /^[A-Z]{2}$/;

/** Number fields of `VesselDimensionsDto` with their bounds (inclusive; `null` = unbounded). */
export const DIMENSION_FIELDS = [
  { key: 'capacity', min: 0, max: null, exclusiveMin: true, required: true },
  { key: 'dwt', min: 0, max: null, required: false },
  { key: 'gt', min: 0, max: null, required: false },
  { key: 'loa', min: 0, max: 600, required: true },
  { key: 'lpp', min: 0, max: 600, required: true },
  { key: 'lwl', min: 0, max: 600, required: true },
  { key: 'b', min: 0, max: 100, required: true },
  { key: 't', min: 0, max: 40, required: true },
  { key: 'vs', min: 0, max: 60, required: true },
  { key: 'cb', min: 0, max: 1.5, required: true },
  { key: 'cbnsp', min: 0, max: 1.5, required: true },
  { key: 'cp', min: 0, max: 1.5, required: true },
  { key: 'cm', min: 0, max: 1.5, required: true },
  { key: 'cwp', min: 0, max: 1.5, required: true },
  { key: 'cstern', min: -100, max: 100, required: true },
  { key: 'c1', min: null, max: null, required: true },
  { key: 'c2', min: null, max: null, required: true },
  { key: 'c3', min: null, max: null, required: true },
  { key: 'c5', min: null, max: null, required: true },
] as const satisfies readonly {
  key: Exclude<keyof VesselDimensionsDto, 'bulbousBow'>;
  min: number | null;
  max: number | null;
  exclusiveMin?: boolean;
  required: boolean;
}[];

export type DimensionKey = (typeof DIMENSION_FIELDS)[number]['key'];

export interface EngineRowValues {
  engineId: string;
  quantity: number | null;
}

/** Raw form state: empty number inputs are `null`, empty selects ''. */
export interface VesselFormValues {
  mmsi: number | null;
  imo: string;
  name: string;
  flag: string;
  builtYear: number | null;
  status: VesselStatus;
  annualVoyagePercentage: number | null;
  typeId: string;
  fuelId: string;
  /** '' = no first fuel formula (the emission service falls back to Holtrop). */
  firstFuelFormulaId: string;
  dimensions: Record<DimensionKey, number | null> & { bulbousBow: boolean };
  mainEngine: EngineRowValues;
  auxEngines: EngineRowValues[];
  portIds: string[];
}

type Translate = TFunction;

function numberField(
  t: Translate,
  rule: { min?: number | null; max?: number | null; exclusiveMin?: boolean; integer?: boolean },
  required: boolean,
) {
  return z
    .number()
    .nullable()
    .superRefine((value, ctx) => {
      if (value === null) {
        if (required) ctx.addIssue({ code: 'custom', message: t('form.errors.required') });
        return;
      }
      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: 'custom', message: t('form.errors.number') });
        return;
      }
      if (rule.integer && !Number.isInteger(value)) {
        ctx.addIssue({ code: 'custom', message: t('form.errors.integer') });
        return;
      }
      const { min = null, max = null } = rule;
      const belowMin = min !== null && (rule.exclusiveMin ? value <= min : value < min);
      const aboveMax = max !== null && value > max;
      if (belowMin || aboveMax) {
        ctx.addIssue({
          code: 'custom',
          message:
            min !== null && max !== null
              ? t('form.errors.range', { min, max })
              : min !== null
                ? t(rule.exclusiveMin ? 'form.errors.positive' : 'form.errors.min', { min })
                : t('form.errors.max', { max }),
        });
      }
    });
}

/** zod schema of the vessel form (messages translated with the `vessels` namespace). */
export function createVesselFormSchema(t: Translate) {
  const dimensionShape = Object.fromEntries(
    DIMENSION_FIELDS.map((field) => [field.key, numberField(t, field, field.required)]),
  ) as Record<DimensionKey, ReturnType<typeof numberField>>;
  const engineRow = z.object({
    engineId: z.string(),
    quantity: numberField(t, { min: 1, max: 64, integer: true }, false),
  });

  return z
    .object({
      mmsi: numberField(t, { integer: true }, true).superRefine((value, ctx) => {
        if (
          value !== null &&
          Number.isInteger(value) &&
          (value < 100_000_000 || value > 999_999_999)
        ) {
          ctx.addIssue({ code: 'custom', message: t('form.errors.mmsi') });
        }
      }),
      imo: z
        .string()
        .trim()
        .refine((value) => value === '' || IMO_PATTERN.test(value.replace(/^IMO\s*/i, '')), {
          message: t('form.errors.imo'),
        }),
      name: z
        .string()
        .trim()
        .min(1, { message: t('form.errors.required') })
        .max(120, { message: t('form.errors.maxLength', { max: 120 }) }),
      flag: z
        .string()
        .trim()
        .refine((value) => value === '' || FLAG_PATTERN.test(value.toUpperCase()), {
          message: t('form.errors.flag'),
        }),
      builtYear: numberField(t, { min: 1800, max: 2200, integer: true }, false),
      status: z.enum(VESSEL_STATUSES),
      annualVoyagePercentage: numberField(t, { min: 0, max: 100 }, true),
      typeId: z.string().min(1, { message: t('form.errors.select') }),
      fuelId: z.string().min(1, { message: t('form.errors.select') }),
      firstFuelFormulaId: z.string(),
      dimensions: z.object({ ...dimensionShape, bulbousBow: z.boolean() }),
      mainEngine: engineRow,
      auxEngines: z.array(engineRow),
      portIds: z
        .array(z.string())
        .max(MAX_VESSEL_PORTS, { message: t('form.errors.maxPorts', { max: MAX_VESSEL_PORTS }) }),
    })
    .superRefine((values, ctx) => {
      if (values.mainEngine.engineId && values.mainEngine.quantity === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['mainEngine', 'quantity'],
          message: t('form.errors.required'),
        });
      }
      const seen = new Set<string>();
      values.auxEngines.forEach((row, index) => {
        if (!row.engineId) {
          ctx.addIssue({
            code: 'custom',
            path: ['auxEngines', index, 'engineId'],
            message: t('form.errors.select'),
          });
        } else if (seen.has(row.engineId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['auxEngines', index, 'engineId'],
            message: t('form.errors.duplicateEngine'),
          });
        }
        seen.add(row.engineId);
        if (row.quantity === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['auxEngines', index, 'quantity'],
            message: t('form.errors.required'),
          });
        }
      });
      const rows = (values.mainEngine.engineId ? 1 : 0) + values.auxEngines.length;
      if (rows > MAX_VESSEL_ENGINES) {
        ctx.addIssue({
          code: 'custom',
          path: ['auxEngines'],
          message: t('form.errors.maxEngines', { max: MAX_VESSEL_ENGINES }),
        });
      }
      if (new Set(values.portIds).size !== values.portIds.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['portIds'],
          message: t('form.errors.duplicatePort'),
        });
      }
    });
}

export type VesselFormSchema = ReturnType<typeof createVesselFormSchema>;

const EMPTY_DIMENSIONS = Object.fromEntries(
  DIMENSION_FIELDS.map((field) => [field.key, null]),
) as Record<DimensionKey, null>;

/** Form state of a new vessel, or of an existing one (detail view). */
export function vesselFormDefaults(vessel?: VesselDetailDto | null): VesselFormValues {
  if (!vessel) {
    return {
      mmsi: null,
      imo: '',
      name: '',
      flag: '',
      builtYear: null,
      status: 'active',
      annualVoyagePercentage: null,
      typeId: '',
      fuelId: '',
      firstFuelFormulaId: '',
      dimensions: { ...EMPTY_DIMENSIONS, bulbousBow: false },
      mainEngine: { engineId: '', quantity: 1 },
      auxEngines: [],
      portIds: [],
    };
  }
  const main = vessel.engines.find((row) => row.role === 'main');
  const dimensions = Object.fromEntries(
    DIMENSION_FIELDS.map((field) => [field.key, vessel.dimensions[field.key] ?? null]),
  ) as Record<DimensionKey, number | null>;
  return {
    mmsi: vessel.mmsi,
    imo: vessel.imo ?? '',
    name: vessel.name,
    flag: vessel.flag ?? '',
    builtYear: vessel.builtYear,
    status: vessel.status,
    annualVoyagePercentage: vessel.annualVoyagePercentage,
    typeId: vessel.type.id,
    fuelId: vessel.fuel.id,
    firstFuelFormulaId: vessel.firstFuelFormula?.id ?? '',
    dimensions: { ...dimensions, bulbousBow: vessel.dimensions.bulbousBow },
    mainEngine: main
      ? { engineId: main.engine.id, quantity: main.quantity }
      : { engineId: '', quantity: 1 },
    auxEngines: vessel.engines
      .filter((row) => row.role === 'auxiliary')
      .map((row) => ({ engineId: row.engine.id, quantity: row.quantity })),
    portIds: vessel.ports.map((port) => port.id),
  };
}

const normalizeImo = (imo: string): string | null => {
  const digits = imo.trim().replace(/^IMO\s*/i, '');
  return digits === '' ? null : digits;
};

const normalizeFlag = (flag: string): string | null => {
  const code = flag.trim().toUpperCase();
  return code === '' ? null : code;
};

/** `VesselDimensionsDto` of valid form values. */
export function toDimensionsDto(values: VesselFormValues): VesselDimensionsDto {
  const dimensions = Object.fromEntries(
    DIMENSION_FIELDS.map((field) => [field.key, values.dimensions[field.key]]),
  ) as Record<DimensionKey, number | null>;
  return {
    ...(dimensions as Record<DimensionKey, number>),
    dwt: dimensions.dwt,
    gt: dimensions.gt,
    bulbousBow: values.dimensions.bulbousBow,
  };
}

/** Engine rows of the API: the main row first, then the auxiliaries in form order. */
export function toEngineRows(values: VesselFormValues): VesselEngineInputDto[] {
  const rows: VesselEngineInputDto[] = [];
  if (values.mainEngine.engineId) {
    rows.push({
      engineId: values.mainEngine.engineId,
      role: 'main',
      quantity: values.mainEngine.quantity ?? 1,
    });
  }
  for (const row of values.auxEngines) {
    rows.push({ engineId: row.engineId, role: 'auxiliary', quantity: row.quantity ?? 1 });
  }
  return rows;
}

/** `POST /vessels` body of valid form values (org = active organization). */
export function toCreateDto(values: VesselFormValues): CreateVesselDto {
  return {
    mmsi: values.mmsi as number,
    imo: normalizeImo(values.imo),
    name: values.name.trim(),
    flag: normalizeFlag(values.flag),
    builtYear: values.builtYear,
    status: values.status,
    annualVoyagePercentage: values.annualVoyagePercentage as number,
    typeId: values.typeId,
    fuelId: values.fuelId,
    firstFuelFormulaId: values.firstFuelFormulaId || null,
    dimensions: toDimensionsDto(values),
    engines: toEngineRows(values),
    portIds: values.portIds,
  };
}

/** The `PATCH /vessels/:id` body: only the identity fields that changed (`{}` = none). */
export function toUpdateDto(values: VesselFormValues, original: VesselDetailDto): UpdateVesselDto {
  const next = toCreateDto(values);
  const patch: UpdateVesselDto = {};
  if (next.mmsi !== original.mmsi) patch.mmsi = next.mmsi;
  if ((next.imo ?? null) !== original.imo) patch.imo = next.imo ?? null;
  if (next.name !== original.name) patch.name = next.name;
  if ((next.flag ?? null) !== original.flag) patch.flag = next.flag ?? null;
  if ((next.builtYear ?? null) !== original.builtYear) patch.builtYear = next.builtYear ?? null;
  if (next.status !== original.status) patch.status = next.status;
  if (next.annualVoyagePercentage !== original.annualVoyagePercentage) {
    patch.annualVoyagePercentage = next.annualVoyagePercentage;
  }
  if (next.typeId !== original.type.id) patch.typeId = next.typeId;
  if (next.fuelId !== original.fuel.id) patch.fuelId = next.fuelId;
  if ((next.firstFuelFormulaId ?? null) !== (original.firstFuelFormula?.id ?? null)) {
    patch.firstFuelFormulaId = next.firstFuelFormulaId ?? null;
  }
  return patch;
}

/** The parts of an edit that need their own PUT (full replacements). */
export function changedSections(values: VesselFormValues, original: VesselDetailDto) {
  const dimensions = toDimensionsDto(values);
  const dimensionsChanged =
    DIMENSION_FIELDS.some(
      (field) => dimensions[field.key] !== (original.dimensions[field.key] ?? null),
    ) || dimensions.bulbousBow !== original.dimensions.bulbousBow;
  const engines = toEngineRows(values);
  const originalEngines = original.engines.map(
    (row) => `${row.role}:${row.engine.id}:${row.quantity}`,
  );
  const enginesChanged =
    engines.length !== originalEngines.length ||
    engines.some(
      (row, index) => `${row.role}:${row.engineId}:${row.quantity}` !== originalEngines[index],
    );
  const portsChanged =
    values.portIds.length !== original.ports.length ||
    values.portIds.some((id, index) => id !== original.ports[index]?.id);
  return { dimensions: dimensionsChanged, engines: enginesChanged, ports: portsChanged };
}

/** Request of a vessel write whose field errors are mapped onto the form. */
export type VesselWriteStep = 'create' | 'identity' | 'dimensions' | 'engines' | 'ports';

/**
 * Form field of a problem's `errors[].field` (fleet paths: `mmsi`, `dimensions.cb`,
 * `engines.1.engineId`, `portIds.2`; PUT bodies without the prefix: `cb`, `1.engineId`, `2`).
 * `null` when the field has no input of its own.
 */
export function formFieldOfProblem(
  field: string,
  step: VesselWriteStep,
  values: VesselFormValues,
): string | null {
  const parts = field.split('.');
  const scoped =
    step === 'dimensions'
      ? ['dimensions', ...parts]
      : step === 'engines'
        ? ['engines', ...parts]
        : step === 'ports'
          ? ['portIds', ...parts]
          : parts;
  const [head, second, third] = scoped;
  if (head === 'dimensions') {
    return second && DIMENSION_FIELDS.some((f) => f.key === second) ? `dimensions.${second}` : null;
  }
  if (head === 'engines') {
    const index = Number(second);
    if (!Number.isInteger(index)) return 'auxEngines';
    const hasMain = Boolean(values.mainEngine.engineId);
    const leaf = third === 'quantity' ? 'quantity' : 'engineId';
    if (hasMain && index === 0) return `mainEngine.${leaf}`;
    return `auxEngines.${hasMain ? index - 1 : index}.${leaf}`;
  }
  if (head === 'portIds') return 'portIds';
  const identity = [
    'mmsi',
    'imo',
    'name',
    'flag',
    'builtYear',
    'status',
    'annualVoyagePercentage',
    'typeId',
    'fuelId',
    'firstFuelFormulaId',
  ];
  return head && identity.includes(head) ? head : null;
}
