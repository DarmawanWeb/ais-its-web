import { ZONE_KINDS, type ZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import { z } from 'zod';

import type {
  CreateZoneDto,
  GeoJsonGeometryDto,
  UpdateZoneDto,
  ZoneDto,
} from '@/shared/api/generated/geo/model';

import { isPointGeometry } from './geometry-rules';

export const CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** A zone code from a name: lowercase ASCII slug (`Area Labuh Batu Ampar` → `area-labuh-batu-ampar`). */
export function slugifyCode(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
    .replace(/[-._]+$/, '');
}

/** Kind-specific property fields edited by the form (contracts `ZONE_PROPERTY_SCHEMAS`). */
export const KIND_PROPERTY_FIELDS: Readonly<Record<ZoneKind, readonly PropertyField[]>> = {
  pipeline: ['operator'],
  transhipment_area: ['authority', 'legalBasis'],
  fishing_ground: ['authority', 'legalBasis'],
  mpa: ['authority', 'legalBasis'],
  restricted: ['authority', 'legalBasis'],
  custom: ['authority', 'legalBasis'],
  anchorage: ['unlocode', 'maxDraughtM'],
  port: ['unlocode', 'maxDraughtM'],
  tss_lane: ['directionDeg', 'maxSpeedKn'],
  shallow_water: ['depthM'],
};

export type PropertyField =
  | 'operator'
  | 'authority'
  | 'legalBasis'
  | 'unlocode'
  | 'maxDraughtM'
  | 'directionDeg'
  | 'maxSpeedKn'
  | 'depthM';

export const NUMERIC_PROPERTIES: ReadonlySet<PropertyField> = new Set([
  'maxDraughtM',
  'directionDeg',
  'maxSpeedKn',
  'depthM',
]);

const optionalNumber = z
  .string()
  .trim()
  .refine((value) => value === '' || Number.isFinite(Number(value)), { message: 'number' });

/** The editor form (strings for inputs; converted by `toCreateBody` / `toUpdateBody`). */
export const zoneFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  code: z.string().trim().regex(CODE_PATTERN, 'codePattern'),
  kind: z.enum(ZONE_KINDS),
  bufferM: z
    .string()
    .trim()
    .refine((value) => value !== '' && Number.isFinite(Number(value)), { message: 'number' })
    .refine((value) => Number(value) >= 0 && Number(value) <= 100_000, { message: 'bufferRange' }),
  alertOnEnter: z.boolean(),
  active: z.boolean(),
  global: z.boolean(),
  source: z.string().trim().max(500, 'tooLong'),
  note: z.string().trim().max(2000, 'tooLong'),
  operator: z.string().trim().max(200, 'tooLong'),
  authority: z.string().trim().max(200, 'tooLong'),
  legalBasis: z.string().trim().max(500, 'tooLong'),
  unlocode: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[A-Z]{2}[A-Z2-9]{3}$/.test(value), {
      message: 'unlocode',
    }),
  maxDraughtM: optionalNumber,
  directionDeg: optionalNumber.refine(
    (value) => value === '' || (Number(value) >= 0 && Number(value) < 360),
    {
      message: 'direction',
    },
  ),
  maxSpeedKn: optionalNumber,
  depthM: optionalNumber,
});

export type ZoneFormValues = z.infer<typeof zoneFormSchema>;

const textOf = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** Form values of an existing zone (or the defaults of a new one). */
export function formValuesOf(
  zone: ZoneDto | null,
  defaults: Partial<ZoneFormValues> = {},
): ZoneFormValues {
  const properties = zone?.properties ?? {};
  return {
    name: zone?.name ?? defaults.name ?? '',
    code: zone?.code ?? defaults.code ?? '',
    kind: zone?.kind ?? defaults.kind ?? 'custom',
    bufferM: zone ? String(zone.bufferM) : (defaults.bufferM ?? '0'),
    alertOnEnter: zone?.alertOnEnter ?? defaults.alertOnEnter ?? false,
    active: zone?.active ?? defaults.active ?? true,
    global: zone?.global ?? defaults.global ?? false,
    source: zone?.source ?? defaults.source ?? '',
    note: textOf(properties.note),
    operator: textOf(properties.operator),
    authority: textOf(properties.authority),
    legalBasis: textOf(properties.legalBasis),
    unlocode: textOf(properties.unlocode),
    maxDraughtM: textOf(properties.maxDraughtM),
    directionDeg: textOf(properties.directionDeg),
    maxSpeedKn: textOf(properties.maxSpeedKn),
    depthM: textOf(properties.depthM),
  };
}

const ALL_PROPERTY_FIELDS: readonly PropertyField[] = [
  'operator',
  'authority',
  'legalBasis',
  'unlocode',
  'maxDraughtM',
  'directionDeg',
  'maxSpeedKn',
  'depthM',
];

/**
 * The zone `properties` to send: the stored ones (unknown keys such as pipeline markers or
 * dataset provenance are kept, the service replaces the object), overwritten by the form fields
 * of the kind; empty fields are removed; `source` is reserved (top-level `source` instead).
 */
export function propertiesOf(
  values: ZoneFormValues,
  stored: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored };
  delete next.source;
  for (const field of ALL_PROPERTY_FIELDS) {
    if (!KIND_PROPERTY_FIELDS[values.kind].includes(field)) continue;
    const value = values[field].trim();
    if (value === '') delete next[field];
    else next[field] = NUMERIC_PROPERTIES.has(field) ? Number(value) : value;
  }
  const note = values.note.trim();
  if (note === '') delete next.note;
  else next.note = note;
  return next;
}

/** `POST /zones` body. `global` is sent only when the user may create global zones. */
export function toCreateBody(
  values: ZoneFormValues,
  geometry: GeoJsonGeometryDto,
  allowGlobal: boolean,
): CreateZoneDto {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    kind: values.kind,
    geometry,
    bufferM: Number(values.bufferM),
    alertOnEnter: values.alertOnEnter,
    active: values.active,
    properties: propertiesOf(values),
    source: values.source.trim() === '' ? null : values.source.trim(),
    ...(allowGlobal ? { global: values.global } : {}),
  };
}

/** `PATCH /zones/:id` body with the changed fields only (geometry when it changed). */
export function toUpdateBody(
  zone: ZoneDto,
  values: ZoneFormValues,
  geometry: GeoJsonGeometryDto | null,
  geometryChanged: boolean,
): UpdateZoneDto {
  const body: UpdateZoneDto = {};
  if (values.name.trim() !== zone.name) body.name = values.name.trim();
  if (values.kind !== zone.kind) body.kind = values.kind;
  if (Number(values.bufferM) !== zone.bufferM) body.bufferM = Number(values.bufferM);
  if (values.alertOnEnter !== zone.alertOnEnter) body.alertOnEnter = values.alertOnEnter;
  if (values.active !== zone.active) body.active = values.active;
  const source = values.source.trim() === '' ? null : values.source.trim();
  if (source !== zone.source) body.source = source;
  const properties = propertiesOf(values, zone.properties);
  if (JSON.stringify(properties) !== JSON.stringify(zone.properties)) body.properties = properties;
  if (geometryChanged && geometry) body.geometry = geometry;
  return body;
}

/** Point zones get a sensible default buffer when switching to a point geometry. */
export function suggestedBuffer(geometry: GeoJsonGeometryDto | null, bufferM: number): number {
  return isPointGeometry(geometry) && !(bufferM > 0) ? 500 : bufferM;
}

/** The `ETag` of a zone: the response header, else the quoted `updatedAt` (geo README "Versions"). */
export function etagOf(
  header: string | null | undefined,
  zone: Pick<ZoneDto, 'updatedAt'>,
): string {
  return header && header.trim() !== '' ? header : `"${zone.updatedAt}"`;
}

/** Who may change a zone (spec §8.5, geo README "Writes"). */
export interface ZoneWriteContext {
  canWrite: boolean;
  isSuperAdmin: boolean;
  isAuthority: boolean;
  orgId: string | null;
}

/** May create global zones: super_admin and authority with `zone:write`. */
export function canWriteGlobal(context: ZoneWriteContext): boolean {
  return context.canWrite && (context.isSuperAdmin || context.isAuthority);
}

/**
 * May edit or delete this zone: global zones by super_admin/authority, organization zones by
 * `zone:write` holders of the owning organization (super_admin: every zone).
 */
export function canWriteZone(
  context: ZoneWriteContext,
  zone: Pick<ZoneDto, 'global' | 'orgId'>,
): boolean {
  if (!context.canWrite) return false;
  if (context.isSuperAdmin) return true;
  if (zone.global) return context.isAuthority;
  return zone.orgId !== null && zone.orgId === context.orgId;
}
