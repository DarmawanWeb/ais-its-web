import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { DEVICE_READING_SCHEMA, devicePayloadJsonSchema, examplePayload } from './mqtt';
import { allowedBuckets, defaultBucket, effectiveBucket, presetToRange, rangeMs } from './range';
import {
  createReadingSchema,
  fromLocalInput,
  readingFieldOfProblem,
  toLocalInput,
  toReadingInput,
} from './reading-form';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;
const NOW = Date.parse('2026-11-22T10:00:00Z');

describe('time ranges and buckets', () => {
  it('builds the preset ranges', () => {
    expect(rangeMs(presetToRange('last24h', NOW))).toBe(86_400_000);
    expect(rangeMs(presetToRange('last7d', NOW))).toBe(7 * 86_400_000);
    expect(presetToRange('thisYear', NOW).from).toBe('2026-01-01T00:00:00.000Z');
  });

  it('respects the API limits of each bucket', () => {
    const month = presetToRange('last30d', NOW);
    const year = presetToRange('thisYear', NOW);
    expect(allowedBuckets(month)).toEqual(['raw', '1h', '1d']);
    expect(allowedBuckets(year)).toEqual(['1h', '1d']);
    expect(defaultBucket(presetToRange('last24h', NOW))).toBe('raw');
    expect(defaultBucket(presetToRange('last7d', NOW))).toBe('1h');
    expect(defaultBucket(month)).toBe('1d');
    expect(effectiveBucket('raw', year)).toBe('1d');
    expect(effectiveBucket('1h', year)).toBe('1h');
    expect(effectiveBucket(null, month)).toBe('1d');
  });
});

describe('manual reading form', () => {
  const schema = createReadingSchema(t, () => NOW);
  const base = {
    mmsi: '525005223',
    time: toLocalInput(new Date(NOW - 3_600_000)),
    periodStart: '',
    fuelMeTon: 0.4,
    fuelAeTon: 0.05,
  };

  it('accepts a plausible reading and builds the API body', () => {
    expect(schema.safeParse(base).success).toBe(true);
    const input = toReadingInput({ ...base, periodStart: toLocalInput(new Date(NOW - 7_200_000)) });
    expect(input).toMatchObject({ mmsi: 525005223, fuelMeTon: 0.4, fuelAeTon: 0.05 });
    expect(Date.parse(input.time)).toBe(fromLocalInput(base.time)?.getTime());
    expect(input.periodStart).toBeDefined();
    expect(toReadingInput(base)).not.toHaveProperty('periodStart');
  });

  it('reports the plausibility rules', () => {
    const result = schema.safeParse({
      ...base,
      time: toLocalInput(new Date(NOW + 30 * 60_000)),
      periodStart: toLocalInput(new Date(NOW + 40 * 60_000)),
      fuelMeTon: -1,
      fuelAeTon: 101,
    });
    const issues = Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
    );
    expect(issues).toMatchObject({
      time: 'manual.errors.future',
      periodStart: 'manual.errors.periodOrder',
      fuelMeTon: 'manual.errors.negative',
      fuelAeTon: 'manual.errors.max {"max":100}',
    });
    const long = schema.safeParse({
      ...base,
      periodStart: toLocalInput(new Date(NOW - 30 * 3_600_000)),
    });
    expect(long.error?.issues[0]?.message).toBe('manual.errors.periodLength {"hours":24}');
    expect(schema.safeParse({ ...base, mmsi: '' }).error?.issues[0]?.message).toBe(
      'manual.errors.vessel',
    );
  });

  it('maps ingest error fields onto the form', () => {
    expect(readingFieldOfProblem('0.time')).toBe('time');
    expect(readingFieldOfProblem('fuelMeTon')).toBe('fuelMeTon');
    expect(readingFieldOfProblem('0.deviceId')).toBeNull();
  });
});

describe('device payload', () => {
  it('derives the MQTT payload schema from the contracts event', () => {
    const schema = JSON.parse(devicePayloadJsonSchema()) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual([
      'time',
      'periodStart',
      'fuelMeTon',
      'fuelAeTon',
    ]);
    expect(schema.required).toEqual(['time', 'fuelMeTon', 'fuelAeTon']);
    expect(JSON.stringify(schema)).not.toContain('pattern');
    const example: unknown = JSON.parse(examplePayload(NOW));
    expect(DEVICE_READING_SCHEMA.safeParse(example).success).toBe(true);
  });
});
