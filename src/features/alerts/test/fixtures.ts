import type {
  AlertDto,
  AlertPageDto,
  AlertSummaryDto,
} from '@/shared/api/generated/notification/model';

/** Fixtures of the alerts feature tests, typed with the generated DTOs (contract changes fail). */
export const ALERT: AlertDto = {
  id: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e01',
  type: 'ews',
  domain: 'safety',
  severity: 'critical',
  status: 'open',
  mmsi: 525005223,
  relatedMmsi: null,
  orgId: '0192f0c8-7d3a-7c2e-9a1b-000000000001',
  title: 'Bahaya EWS: KM Bahari Nusantara',
  message: '103 m dari pipa',
  lat: 1.152,
  lon: 103.902,
  zoneId: null,
  methodId: 'ews.pipeline_distance_status',
  dedupKey: 'ews:525005223',
  messageKey: null,
  messageParams: {},
  resolutionReason: null,
  resolutionMessageKey: null,
  resolutionMessageParams: {},
  resolutionEventId: null,
  data: { ewsStatus: 0, pipelineDistanceM: 102.6, methodId: 'ews.pipeline_distance_status' },
  source: 'safety',
  occurrences: 3,
  occurredAt: '2026-11-22T10:00:00.000Z',
  lastOccurredAt: '2026-11-22T10:10:00.000Z',
  acknowledgedBy: null,
  acknowledgedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  updatedAt: '2026-11-22T10:10:00.000Z',
};

export const WARNING_ALERT: AlertDto = {
  ...ALERT,
  id: '0192f0c8-7d3a-7c2e-9a1b-0000000a1e02',
  type: 'collision',
  severity: 'warning',
  mmsi: 525019004,
  relatedMmsi: 563012345,
  title: 'Risiko tubrukan: TB Pelita 5 ↔ Lion City Spirit',
  message: 'CPA 0,06 nm dalam 11,5 menit',
  methodId: 'collision.cpa_tcpa',
  data: { risk: 'medium', cpaNm: 0.064, tcpaMin: 11.5 },
  occurrences: 1,
} satisfies AlertDto;

export const pageOf = (data: AlertDto[], nextCursor: string | null = null): AlertPageDto => ({
  data,
  page: { nextCursor, limit: 25 },
});

export const SUMMARY: AlertSummaryDto = {
  total: 2,
  bySeverity: { info: 0, warning: 1, critical: 1 },
  byDomain: { safety: 2, surveillance: 0 },
  byType: { ews: 1, collision: 1 },
};
