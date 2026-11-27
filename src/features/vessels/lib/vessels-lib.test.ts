import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { RegistryParticularsDto } from '@/shared/api/generated/fleet/model';

import { VESSEL_DETAIL } from '../test/fixtures';
import {
  checkFuelFormula,
  evaluateFuelFormula,
  FUEL_FORMULA_MAX_DEPTH,
} from '@/shared/lib/fuel-formula';
import { applyPrefill, matchVesselType, registryPrefill } from './registry';
import { LATEST_WINDOW_HOURS, latestReadingsWindow } from './telemetry';
import { flagName, mapLinkOf, parseMmsiParam, positionFreshness } from './vessel';
import {
  changedSections,
  createVesselFormSchema,
  formFieldOfProblem,
  toCreateDto,
  toEngineRows,
  toUpdateDto,
  vesselFormDefaults,
  type VesselFormValues,
} from './vessel-form';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

describe('fuel formula grammar (fleet parity)', () => {
  it.each([
    '-0.0382 * speedKnot ** 2 + 0.8658 * speedKnot - 0.0197',
    '1.5103 * Math.exp(-0.064 * speedKnot)',
    'max(0.5, speedKnot ^ 2 / 3)',
    'pow(speedKnot, 2) + ln(2) + log(3) + sqrt(4) + abs(-1) + min(1, 2, 3)',
    '.5e1 * (speedKnot)',
  ])('accepts %s', (formula) => {
    expect(checkFuelFormula(formula).valid).toBe(true);
  });

  it.each([
    ['', 'empty', 0],
    ['   ', 'empty', 0],
    ['process.exit(1)', 'unknownIdentifier', 0],
    ['Math.random()', 'unknownIdentifier', 0],
    ['speed * 2', 'unknownIdentifier', 0],
    ['speedKnot;', 'unexpectedCharacter', 9],
    ["'1'", 'unexpectedCharacter', 0],
    ['10 % 3', 'unexpectedCharacter', 3],
    ['pow(1)', 'arity', 0],
    ['exp(1, 2)', 'arity', 0],
    ['1e999', 'numberOutOfRange', 0],
    ['(1 + 2', 'expected', 6],
    ['1 +', 'unexpectedEnd', 3],
    ['1 2', 'unexpectedToken', 2],
  ] as const)('refuses %j (%s at %d)', (formula, code, position) => {
    const check = checkFuelFormula(formula);
    expect(check.valid).toBe(false);
    if (!check.valid) {
      expect(check.issue.code).toBe(code);
      expect(check.issue.position).toBe(position);
    }
  });

  it('limits the length and the nesting depth', () => {
    expect(checkFuelFormula('1'.repeat(501))).toMatchObject({ issue: { code: 'tooLong' } });
    const nested = `${'('.repeat(FUEL_FORMULA_MAX_DEPTH + 1)}1${')'.repeat(FUEL_FORMULA_MAX_DEPTH + 1)}`;
    expect(checkFuelFormula(nested)).toMatchObject({ issue: { code: 'tooDeep' } });
    expect(
      checkFuelFormula(
        `${'('.repeat(FUEL_FORMULA_MAX_DEPTH)}1${')'.repeat(FUEL_FORMULA_MAX_DEPTH)}`,
      ).valid,
    ).toBe(true);
  });

  it('evaluates with ^ as power, unary minus weaker than power', () => {
    expect(evaluateFuelFormula('2 ^ 3 ^ 2', 0)).toBe(512);
    expect(evaluateFuelFormula('-speedKnot ** 2', 3)).toBe(-9);
    expect(evaluateFuelFormula('1.5103 * Math.exp(-0.064 * speedKnot)', 10)).toBeCloseTo(0.796, 3);
    expect(evaluateFuelFormula('1 / 0', 1)).toBeNull();
    expect(evaluateFuelFormula('nope', 1)).toBeNull();
  });
});

function validValues(): VesselFormValues {
  return vesselFormDefaults(VESSEL_DETAIL);
}

describe('vessel form schema', () => {
  const schema = createVesselFormSchema(t);

  it('accepts the values of a stored vessel and builds the create body', () => {
    const values = validValues();
    expect(schema.safeParse(values).success).toBe(true);
    const dto = toCreateDto(values);
    expect(dto).toMatchObject({
      mmsi: VESSEL_DETAIL.mmsi,
      imo: VESSEL_DETAIL.imo,
      flag: 'ID',
      typeId: VESSEL_DETAIL.type.id,
      firstFuelFormulaId: VESSEL_DETAIL.firstFuelFormula?.id,
    });
    expect(dto.engines?.[0]).toMatchObject({ role: 'main', quantity: 1 });
    expect(dto.engines?.filter((row) => row.role === 'auxiliary')).toHaveLength(1);
  });

  it('reports the DTO constraints with translated messages', () => {
    const values = validValues();
    values.mmsi = 12345;
    values.imo = '123';
    values.flag = 'IDN';
    values.builtYear = 1700;
    values.annualVoyagePercentage = 120;
    values.dimensions.cb = 2;
    values.dimensions.capacity = 0;
    values.dimensions.t = null;
    values.auxEngines = [
      { engineId: 'e1', quantity: 1 },
      { engineId: 'e1', quantity: 0 },
    ];
    const result = schema.safeParse(values);
    expect(result.success).toBe(false);
    const issues = Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
    );
    expect(issues).toMatchObject({
      mmsi: 'form.errors.mmsi',
      imo: 'form.errors.imo',
      flag: 'form.errors.flag',
      builtYear: 'form.errors.range {"min":1800,"max":2200}',
      annualVoyagePercentage: 'form.errors.range {"min":0,"max":100}',
      'dimensions.cb': 'form.errors.range {"min":0,"max":1.5}',
      'dimensions.capacity': 'form.errors.positive {"min":0}',
      'dimensions.t': 'form.errors.required',
      'auxEngines.1.engineId': 'form.errors.duplicateEngine',
      'auxEngines.1.quantity': 'form.errors.range {"min":1,"max":64}',
    });
  });

  it('normalizes IMO and flag and clears empty optionals', () => {
    const values = { ...validValues(), imo: 'IMO 9037941', flag: 'sg', firstFuelFormulaId: '' };
    expect(schema.safeParse(values).success).toBe(true);
    expect(toCreateDto(values)).toMatchObject({
      imo: '9037941',
      flag: 'SG',
      firstFuelFormulaId: null,
    });
    expect(toCreateDto({ ...values, imo: '', flag: '' })).toMatchObject({ imo: null, flag: null });
  });

  it('patches only the changed identity fields and detects changed sections', () => {
    const values = validValues();
    expect(toUpdateDto(values, VESSEL_DETAIL)).toEqual({});
    expect(changedSections(values, VESSEL_DETAIL)).toEqual({
      dimensions: false,
      engines: false,
      ports: false,
    });
    values.name = 'KM Bahari Baru';
    values.dimensions.vs = 13;
    values.auxEngines = [];
    values.portIds = [...values.portIds].reverse();
    expect(toUpdateDto(values, VESSEL_DETAIL)).toEqual({ name: 'KM Bahari Baru' });
    expect(changedSections(values, VESSEL_DETAIL)).toEqual({
      dimensions: true,
      engines: true,
      ports: true,
    });
  });

  it('maps server field paths onto form fields', () => {
    const values = validValues();
    expect(toEngineRows(values)[0]?.role).toBe('main');
    expect(formFieldOfProblem('mmsi', 'create', values)).toBe('mmsi');
    expect(formFieldOfProblem('dimensions.cb', 'create', values)).toBe('dimensions.cb');
    expect(formFieldOfProblem('cb', 'dimensions', values)).toBe('dimensions.cb');
    expect(formFieldOfProblem('engines.0.engineId', 'create', values)).toBe('mainEngine.engineId');
    expect(formFieldOfProblem('1.quantity', 'engines', values)).toBe('auxEngines.0.quantity');
    expect(formFieldOfProblem('2', 'ports', values)).toBe('portIds');
    expect(formFieldOfProblem('legacyId', 'create', values)).toBeNull();
    const noMain = { ...values, mainEngine: { engineId: '', quantity: 1 } };
    expect(formFieldOfProblem('engines.0.engineId', 'create', noMain)).toBe(
      'auxEngines.0.engineId',
    );
  });
});

const ENTRY: RegistryParticularsDto = {
  id: 'r1',
  imo: 'IMO9037941',
  mmsi: 525005223,
  name: 'BAHARI NUSANTARA',
  built: 1990,
  flag: 'id',
  flagName: 'Indonesia',
  type: 'TNK',
  typeName: 'Oil Tanker',
  gt: 2877,
  dwt: 3500,
  loaM: 73.3,
  beamM: 16.3,
  draughtM: 4.1,
  class: 'BKI',
  classCode: 'BKI',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('registry lookup', () => {
  const types = [
    { id: 'bulk', code: 'bulk_carrier', name: 'Bulk carrier' },
    { id: 'tanker', code: 'tanker', name: 'Tanker' },
  ];

  it('matches the ship type by name', () => {
    expect(matchVesselType(ENTRY, types)).toBe('tanker');
    expect(matchVesselType({ type: null, typeName: 'Bulk Carrier' }, types)).toBe('bulk');
    expect(matchVesselType({ type: null, typeName: 'Yacht' }, types)).toBeNull();
  });

  it('prefills identity and principal dimensions', () => {
    const prefill = registryPrefill(ENTRY, types);
    const values = applyPrefill(vesselFormDefaults(), prefill);
    expect(values).toMatchObject({
      name: 'BAHARI NUSANTARA',
      mmsi: 525005223,
      imo: '9037941',
      flag: 'ID',
      builtYear: 1990,
      typeId: 'tanker',
    });
    expect(values.dimensions).toMatchObject({ gt: 2877, dwt: 3500, loa: 73.3, b: 16.3, t: 4.1 });
  });
});

describe('vessel helpers', () => {
  it('names flags, rates freshness and builds links', () => {
    expect(flagName('ID', 'en')).toBe('Indonesia');
    expect(flagName(null, 'id')).toBeNull();
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(positionFreshness('2026-11-22T09:55:00Z', now)).toBe('live');
    expect(positionFreshness('2026-11-22T06:00:00Z', now)).toBe('recent');
    expect(positionFreshness('2026-11-20T06:00:00Z', now)).toBe('stale');
    expect(positionFreshness(null, now)).toBe('none');
    expect(mapLinkOf(525005223, { lat: 1.15, lon: 103.9 })).toBe(
      '/map?vessel=525005223&lat=1.15000&lon=103.90000&z=11',
    );
    expect(parseMmsiParam('525005223')).toBe(525005223);
    expect(parseMmsiParam('12')).toBeNull();
    expect(parseMmsiParam(undefined)).toBeNull();
  });
});

describe('latestReadingsWindow', () => {
  it('reads the 30 days before the newest reading, including it', () => {
    expect(LATEST_WINDOW_HOURS).toBe(720);
    expect(latestReadingsWindow('2026-11-22T10:00:00.000Z')).toEqual({
      from: '2026-10-23T10:00:00.000Z',
      to: '2026-11-22T10:00:01.000Z',
    });
  });

  it('is null without a reading or with an invalid time', () => {
    expect(latestReadingsWindow(null)).toBeNull();
    expect(latestReadingsWindow(undefined)).toBeNull();
    expect(latestReadingsWindow('yesterday')).toBeNull();
  });
});
