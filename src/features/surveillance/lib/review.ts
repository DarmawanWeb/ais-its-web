import type { ReviewEventDto } from '@/shared/api/generated/surveillance/model';

import type { SurveillanceEvent, TranshipmentResult } from './dto';
import { readResolutionReason } from './event-data';
import type { ReviewStatus } from './types';

/** Verdict shown in the review form: the stored verdict, else "open" (no verdict yet). */
export function initialReviewStatus(event: Pick<SurveillanceEvent, 'status'>): ReviewStatus {
  return event.status === 'confirmed' || event.status === 'dismissed' ? event.status : 'open';
}

/**
 * Body of `PATCH /surveillance/events/:id`: an unchanged note is omitted (the service keeps the
 * stored note), an emptied note clears it (`null`), anything else replaces it.
 */
export function reviewBody(
  event: Pick<SurveillanceEvent, 'note'>,
  status: ReviewStatus,
  noteText: string,
): ReviewEventDto {
  const next = noteText.trim();
  const stored = (event.note ?? '').trim();
  if (next === stored) return { status };
  return { status, note: next === '' ? null : next };
}

/** `true` when submitting would change the verdict or the note. */
export function reviewChanged(
  event: Pick<SurveillanceEvent, 'note' | 'status'>,
  status: ReviewStatus,
  noteText: string,
): boolean {
  return status !== initialReviewStatus(event) || noteText.trim() !== (event.note ?? '').trim();
}

export type TimelineKind =
  'occurred' | 'opened' | 'analysis' | 'lastSeen' | 'resolved' | 'reviewed';

export interface TimelineEntry {
  kind: TimelineKind;
  at: string;
  /** Extra values of the entry (accuracy of an analysis, resolution reason, verdict). */
  detail?: { accuracy?: number; reason?: string | null; status?: string; note?: string | null };
}

const MINUTE = 60_000;

/**
 * Lifecycle of an event in time order: occurrence, detection, positive analyses (transhipment
 * results of the occurrence), last observation, detector resolution and review.
 */
export function eventTimeline(
  event: SurveillanceEvent,
  results: readonly Pick<TranshipmentResult, 'detectedAt' | 'accuracy' | 'eventId'>[] = [],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const opened = Date.parse(event.openedAt);
  if (Math.abs(Date.parse(event.time) - opened) > MINUTE) {
    entries.push({ kind: 'occurred', at: event.time });
  }
  entries.push({ kind: 'opened', at: event.openedAt });
  for (const result of results) {
    if (result.eventId !== event.id) continue;
    entries.push({
      kind: 'analysis',
      at: result.detectedAt,
      detail: { accuracy: result.accuracy },
    });
  }
  const lastSeen = Date.parse(event.lastSeenAt);
  if (
    lastSeen - opened > MINUTE &&
    (event.resolvedAt === null || Date.parse(event.resolvedAt) - lastSeen > MINUTE)
  ) {
    entries.push({ kind: 'lastSeen', at: event.lastSeenAt });
  }
  if (event.resolvedAt !== null) {
    entries.push({
      kind: 'resolved',
      at: event.resolvedAt,
      detail: { reason: readResolutionReason(event.resolution) },
    });
  }
  if (event.reviewedAt !== null) {
    entries.push({
      kind: 'reviewed',
      at: event.reviewedAt,
      detail: { status: event.status, note: event.note },
    });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
