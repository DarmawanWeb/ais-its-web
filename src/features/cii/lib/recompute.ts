/** Longest recomputation range (emission README: `RECOMPUTE_MAX_DAYS`, 7 days by default). */
export const RECOMPUTE_MAX_DAYS = 7;

export type RecomputeRangeIssue = 'invalid' | 'order' | 'future' | 'tooLong' | 'tooOld';

/**
 * Client-side check of a recomputation range before `POST …/recompute`: both ends valid,
 * `from < to`, `to ≤ now`, at most `RECOMPUTE_MAX_DAYS` long and inside the 7-day stream window.
 */
export function recomputeRangeIssue(
  from: Date,
  to: Date,
  now: Date = new Date(),
): RecomputeRangeIssue | null {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 'invalid';
  if (from.getTime() >= to.getTime()) return 'order';
  // One minute of slack for the time spent filling the form.
  if (to.getTime() > now.getTime() + 60_000) return 'future';
  const day = 24 * 3_600_000;
  if (to.getTime() - from.getTime() > RECOMPUTE_MAX_DAYS * day) return 'tooLong';
  if (now.getTime() - from.getTime() > RECOMPUTE_MAX_DAYS * day + 60_000) return 'tooOld';
  return null;
}

/** `yyyy-MM-ddTHH:mm` of a date in local time (value of `<input type="datetime-local">`). */
export function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Parses the value of `<input type="datetime-local">` (local time). */
export function fromLocalInputValue(value: string): Date {
  return new Date(value);
}

/** Splits a job error `CODE: message` (README "Recomputation `failed`"). */
export function parseJobError(error: string | null | undefined): {
  code: string | null;
  message: string;
} | null {
  if (!error) return null;
  const match = /^([A-Z][A-Z0-9_]*):\s*(.*)$/s.exec(error);
  return match
    ? { code: match[1] ?? null, message: match[2] ?? '' }
    : { code: null, message: error };
}
