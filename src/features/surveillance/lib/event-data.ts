import { z } from 'zod';

/**
 * Typed, lenient readers of the detector-specific `data` (and `resolution`) of surveillance
 * events (surveillance service README, "Detectors"). The API types them as open records, so
 * every field is optional and an invalid value reads as missing instead of failing the page.
 */
const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);
const nullableNum = z.number().nullable().optional().catch(undefined);

const distributionSchema = z
  .object({ low: z.number(), medium: z.number(), high: z.number() })
  .optional()
  .catch(undefined);

export const TranshipmentDataSchema = z.object({
  isIllegal: z.boolean().optional().catch(undefined),
  accuracy: num,
  startTimestamp: str,
  endTimestamp: str,
  averagePriority: num,
  priorityDistribution: distributionSchema,
  accumulatedPriority: num,
  observations: num,
  lastDistanceM: nullableNum,
  route1Points: num,
  route2Points: num,
  methodIds: z.array(z.string()).optional().catch(undefined),
});
export type TranshipmentData = z.infer<typeof TranshipmentDataSchema>;

export const AnomalyDataSchema = z.object({
  navstatus: num,
  predictedNavstatus: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .catch(undefined),
  streak: num,
  minPositions: num,
  sogKn: num,
});
export type AnomalyData = z.infer<typeof AnomalyDataSchema>;

export const DarkDataSchema = z.object({
  lastSeenAt: str,
  lastSogKn: num,
  lastCogDeg: num,
  gapMin: num,
  gapThresholdMin: num,
  nearestHarbourM: nullableNum,
});
export type DarkData = z.infer<typeof DarkDataSchema>;

export const DarkResolutionSchema = z.object({
  reason: z.string().nullable().optional().catch(undefined),
  reappearedAt: str,
  lastSeenAt: z.string().nullable().optional().catch(undefined),
  gapMin: nullableNum,
  lat: num,
  lon: num,
});
export type DarkResolution = z.infer<typeof DarkResolutionSchema>;

export const ZoneEventDataSchema = z.object({
  zoneKind: str,
  zoneCode: str,
  zoneName: str,
  durationMin: num,
  positions: num,
  meanSogKn: num,
  courseChangeRateDegPerMin: num,
  totalCourseChangeDeg: num,
  sogKn: num,
});
export type ZoneEventData = z.infer<typeof ZoneEventDataSchema>;

export const ResolutionSchema = z.object({
  reason: z.string().nullable().optional().catch(undefined),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  return result.success ? result.data : schema.parse({});
}

export const readTranshipmentData = (data: unknown) => parse(TranshipmentDataSchema, data);
export const readAnomalyData = (data: unknown) => parse(AnomalyDataSchema, data);
export const readDarkData = (data: unknown) => parse(DarkDataSchema, data);
export const readDarkResolution = (resolution: unknown) => parse(DarkResolutionSchema, resolution);
export const readZoneEventData = (data: unknown) => parse(ZoneEventDataSchema, data);
export const readResolutionReason = (resolution: unknown): string | null =>
  parse(ResolutionSchema, resolution).reason ?? null;

/**
 * Resolution reasons the surveillance detectors write (free English text in
 * `resolution.reason`, surveillance service `src/detectors/*`), mapped to translation keys
 * (`surveillance:resolution.<key>`). Unknown reasons are shown as sent.
 */
const RESOLUTION_REASON_KEYS: Readonly<Record<string, string>> = {
  escalated: 'escalated',
  'AIS reports resumed': 'aisResumed',
  'navigational status consistent again': 'navstatusConsistent',
  'left the zone': 'leftZone',
  'loitering pattern ended': 'loiteringEnded',
  'analysis no longer positive': 'analysisNegative',
  'pair no longer observed together': 'pairSeparated',
  'zone deleted': 'zoneDeleted',
  'zone no longer alerts on entry': 'zoneNoLongerAlerts',
};

/** Translation key of a known resolution reason (`null` for unknown or missing reasons). */
export function resolutionReasonKey(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return RESOLUTION_REASON_KEYS[reason] ?? null;
}

/** Id of the event that superseded an escalated occurrence (`resolution.supersededBy`). */
export function supersededBy(resolution: unknown): string | null {
  if (!resolution || typeof resolution !== 'object') return null;
  const value = (resolution as Record<string, unknown>).supersededBy;
  return typeof value === 'string' && value !== '' ? value : null;
}

function minutesBetween(from: string, to: Date): number | undefined {
  const start = Date.parse(from);
  if (Number.isNaN(start)) return undefined;
  return Math.max(0, (to.getTime() - start) / 60_000);
}

/**
 * Length of an AIS gap in minutes: the resolved gap (`resolution.gapMin`) once the vessel
 * reappeared, otherwise the time since its last sighting (still growing), falling back to the
 * gap measured when the detector raised the event.
 */
export function darkGapMinutes(
  event: { data: unknown; resolution: unknown; resolvedAt: string | null },
  now: Date = new Date(),
): number | undefined {
  const data = readDarkData(event.data);
  if (event.resolvedAt !== null) {
    const resolution = readDarkResolution(event.resolution);
    if (typeof resolution.gapMin === 'number') return resolution.gapMin;
    if (data.lastSeenAt) {
      const end = new Date(resolution.reappearedAt ?? event.resolvedAt);
      return minutesBetween(data.lastSeenAt, end) ?? data.gapMin;
    }
    return data.gapMin;
  }
  if (data.lastSeenAt) return minutesBetween(data.lastSeenAt, now) ?? data.gapMin;
  return data.gapMin;
}

/** Whole days, hours and minutes of a duration (for `2 h 5 j 10 mnt`-style labels). */
export function durationParts(minutes: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.round(minutes));
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}
