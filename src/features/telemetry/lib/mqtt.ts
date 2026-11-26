import { FuelReadingRecordedV1Schema } from '@darmawanweb/ais-its-contracts/events';
import { z } from 'zod';

/**
 * Payload a fuel meter publishes on its MQTT topic (`aisits/telemetry/<deviceId>`): the reading
 * fields of the contracts event `FuelReadingRecordedV1` (the MMSI is the device's, unknown
 * fields are ignored; one object or an array of ≤ 1000).
 */
export const DEVICE_READING_SCHEMA = FuelReadingRecordedV1Schema.pick({
  time: true,
  periodStart: true,
  fuelMeTon: true,
  fuelAeTon: true,
}).partial({ periodStart: true });

function stripPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPatterns);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'pattern')
        .map(([key, child]) => [key, stripPatterns(child)]),
    );
  }
  return value;
}

/** JSON Schema of the device payload (date-time regex patterns left out for readability). */
export function devicePayloadJsonSchema(): string {
  return JSON.stringify(
    stripPatterns(z.toJSONSchema(DEVICE_READING_SCHEMA, { io: 'input' })),
    null,
    2,
  );
}

/** Example message of a meter reporting the last 10 minutes. */
export function examplePayload(now: number): string {
  const time = new Date(Math.floor(now / 600_000) * 600_000);
  const start = new Date(time.getTime() - 600_000);
  return JSON.stringify(
    {
      time: time.toISOString(),
      periodStart: start.toISOString(),
      fuelMeTon: 0.042,
      fuelAeTon: 0.006,
    },
    null,
    2,
  );
}
