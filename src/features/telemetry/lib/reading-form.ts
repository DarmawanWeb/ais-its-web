import type { TFunction } from 'i18next';
import { z } from 'zod';

import type { FuelReadingInputDto } from '@/shared/api/generated/telemetry/model';

/**
 * Plausibility rules of a manual reading (telemetry handbook "Ingestion rules", method
 * telemetry.reading_validation) with the service's default limits: amounts ≥ 0 and at most
 * TELEMETRY_MAX_FUEL_ME_TON (500 t) / TELEMETRY_MAX_FUEL_AE_TON (100 t), time at most
 * 5 minutes ahead, periodStart before time and at most 24 h earlier. The service re-checks
 * with its configured values.
 */
export const READING_LIMITS = {
  maxFuelMeTon: 500,
  maxFuelAeTon: 100,
  maxFutureSkewMin: 5,
  maxPeriodH: 24,
  maxAgeDays: 1825,
} as const;

export interface ReadingFormValues {
  mmsi: string;
  /** `datetime-local` value (local time of the browser). */
  time: string;
  periodStart: string;
  fuelMeTon: number | null;
  fuelAeTon: number | null;
}

const MINUTE = 60_000;

/** `datetime-local` value of an instant in the browser's time zone (minutes precision). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Instant of a `datetime-local` value (local time), or null. */
export function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function amount(t: TFunction, max: number) {
  return z
    .number()
    .nullable()
    .superRefine((value, ctx) => {
      if (value === null) ctx.addIssue({ code: 'custom', message: t('manual.errors.required') });
      else if (!Number.isFinite(value))
        ctx.addIssue({ code: 'custom', message: t('manual.errors.number') });
      else if (value < 0) ctx.addIssue({ code: 'custom', message: t('manual.errors.negative') });
      else if (value > max)
        ctx.addIssue({ code: 'custom', message: t('manual.errors.max', { max }) });
    });
}

/** zod schema of the manual reading form; `now` is injected for deterministic tests. */
export function createReadingSchema(t: TFunction, now: () => number = Date.now) {
  return z
    .object({
      mmsi: z.string().regex(/^\d{9}$/, { message: t('manual.errors.vessel') }),
      time: z.string().min(1, { message: t('manual.errors.required') }),
      periodStart: z.string(),
      fuelMeTon: amount(t, READING_LIMITS.maxFuelMeTon),
      fuelAeTon: amount(t, READING_LIMITS.maxFuelAeTon),
    })
    .superRefine((values, ctx) => {
      const time = fromLocalInput(values.time);
      if (!time) {
        if (values.time)
          ctx.addIssue({ code: 'custom', path: ['time'], message: t('manual.errors.date') });
        return;
      }
      if (time.getTime() > now() + READING_LIMITS.maxFutureSkewMin * MINUTE) {
        ctx.addIssue({ code: 'custom', path: ['time'], message: t('manual.errors.future') });
      }
      if (time.getTime() < now() - READING_LIMITS.maxAgeDays * 1440 * MINUTE) {
        ctx.addIssue({ code: 'custom', path: ['time'], message: t('manual.errors.tooOld') });
      }
      if (!values.periodStart) return;
      const start = fromLocalInput(values.periodStart);
      if (!start) {
        ctx.addIssue({ code: 'custom', path: ['periodStart'], message: t('manual.errors.date') });
      } else if (start.getTime() >= time.getTime()) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodStart'],
          message: t('manual.errors.periodOrder'),
        });
      } else if (time.getTime() - start.getTime() > READING_LIMITS.maxPeriodH * 60 * MINUTE) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodStart'],
          message: t('manual.errors.periodLength', { hours: READING_LIMITS.maxPeriodH }),
        });
      }
    });
}

/** `POST /telemetry/readings` body of valid form values (ISO-8601 UTC). */
export function toReadingInput(values: ReadingFormValues): FuelReadingInputDto {
  const time = fromLocalInput(values.time) as Date;
  const start = fromLocalInput(values.periodStart);
  return {
    mmsi: Number(values.mmsi),
    time: time.toISOString(),
    ...(start ? { periodStart: start.toISOString() } : {}),
    fuelMeTon: values.fuelMeTon as number,
    fuelAeTon: values.fuelAeTon as number,
  };
}

/** Form field of an ingest error (`0.time`, `fuelMeTon`, `0.periodStart`), or null. */
export function readingFieldOfProblem(field: string): keyof ReadingFormValues | null {
  const leaf = field.split('.').at(-1) ?? '';
  return (
    (['mmsi', 'time', 'periodStart', 'fuelMeTon', 'fuelAeTon'] as const).find(
      (name) => name === leaf,
    ) ?? null
  );
}
