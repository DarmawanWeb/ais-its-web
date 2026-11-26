import { describe, expect, it } from 'vitest';

import { makeResult, makeTranshipmentEvent } from '../test/fixtures';
import { eventTimeline, initialReviewStatus, reviewBody, reviewChanged } from './review';

describe('review body', () => {
  it('omits an unchanged note so the service keeps it', () => {
    expect(
      reviewBody({ note: 'Kapal sudah diperiksa' }, 'confirmed', ' Kapal sudah diperiksa '),
    ).toEqual({
      status: 'confirmed',
    });
    expect(reviewBody({ note: null }, 'dismissed', '')).toEqual({ status: 'dismissed' });
  });

  it('replaces or clears a changed note', () => {
    expect(reviewBody({ note: 'lama' }, 'confirmed', 'baru')).toEqual({
      status: 'confirmed',
      note: 'baru',
    });
    expect(reviewBody({ note: 'lama' }, 'open', '   ')).toEqual({ status: 'open', note: null });
  });

  it('knows the initial verdict and whether anything changed', () => {
    expect(initialReviewStatus({ status: 'resolved' })).toBe('open');
    expect(initialReviewStatus({ status: 'dismissed' })).toBe('dismissed');
    expect(reviewChanged({ status: 'confirmed', note: 'x' }, 'confirmed', 'x')).toBe(false);
    expect(reviewChanged({ status: 'resolved', note: null }, 'open', '')).toBe(false);
    expect(reviewChanged({ status: 'open', note: null }, 'confirmed', '')).toBe(true);
  });
});

describe('event timeline', () => {
  it('orders the lifecycle and keeps only the analyses of the occurrence', () => {
    const event = makeTranshipmentEvent({
      time: '2026-11-21T08:00:00.000Z',
      openedAt: '2026-11-21T08:45:00.000Z',
      lastSeenAt: '2026-11-21T09:30:00.000Z',
      resolvedAt: '2026-11-21T10:40:00.000Z',
      resolution: { reason: 'pair not observed together' },
      reviewedAt: '2026-11-21T11:00:00.000Z',
      status: 'confirmed',
      note: 'STS terkonfirmasi',
    });
    const entries = eventTimeline(event, [
      makeResult({ eventId: event.id, detectedAt: '2026-11-21T09:15:00.000Z', accuracy: 81 }),
      makeResult({ detectedAt: '2026-11-21T09:16:00.000Z' }),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual([
      'occurred',
      'opened',
      'analysis',
      'lastSeen',
      'resolved',
      'reviewed',
    ]);
    expect(entries[2]?.detail?.accuracy).toBe(81);
    expect(entries[4]?.detail?.reason).toBe('pair not observed together');
    expect(entries[5]?.detail).toEqual({ status: 'confirmed', note: 'STS terkonfirmasi' });
  });

  it('skips duplicate moments of a fresh event', () => {
    const event = makeTranshipmentEvent({
      time: '2026-11-21T08:00:00.000Z',
      openedAt: '2026-11-21T08:00:20.000Z',
      lastSeenAt: '2026-11-21T08:00:30.000Z',
    });
    expect(eventTimeline(event).map((entry) => entry.kind)).toEqual(['opened']);
  });
});
