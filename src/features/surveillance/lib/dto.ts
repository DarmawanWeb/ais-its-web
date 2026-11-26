import type {
  EventsControllerList200,
  TranshipmentResultDto,
  TranshipmentsControllerList200,
} from '@/shared/api/generated/surveillance/model';

/**
 * Surveillance events as `GET /surveillance/events[/:id]` returns them: a union discriminated
 * by `type` (transhipment, anomaly, dark, geofence, fishing), each with its typed `data` and
 * `resolution` (surveillance `openapi.json` 0.2). The feature reads the payloads through the
 * lenient readers in `event-data.ts`, so a detector added later still renders.
 */
export type SurveillanceEvent = EventsControllerList200['data'][number];
export type SurveillanceEventType = SurveillanceEvent['type'];
export type TranshipmentResult = TranshipmentResultDto;
export type EventsPage = EventsControllerList200;
export type TranshipmentsPage = TranshipmentsControllerList200;
