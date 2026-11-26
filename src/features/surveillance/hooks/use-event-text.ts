import {
  isNavStatus,
  isZoneKind,
  NAV_STATUS_LABELS,
  PREDICTED_NAV_STATUS_LABELS,
  ZONE_KIND_LABELS,
} from '@darmawanweb/ais-its-contracts/domain';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateTime, formatNumber } from '@/shared/lib/format';

import type { SurveillanceEvent } from '../lib/dto';
import {
  durationParts,
  readAnomalyData,
  readDarkData,
  readTranshipmentData,
  readZoneEventData,
} from '../lib/event-data';

type EventLike = Pick<
  SurveillanceEvent,
  | 'type'
  | 'title'
  | 'message'
  | 'mmsi'
  | 'vesselName'
  | 'relatedMmsi'
  | 'relatedVesselName'
  | 'zoneName'
  | 'data'
>;

/**
 * Localized headline and sentence of an event, built from its type and detector data (the
 * service's `title` / `message` are English); unknown types fall back to the service text.
 */
export function useEventText() {
  const { t, i18n } = useTranslation('surveillance');
  const lang = i18n.language;
  const locale = lang === 'en' ? 'en' : 'id';
  return useMemo(() => {
    const num = (value: number | undefined, digits = 1) =>
      value === undefined ? '—' : formatNumber(value, lang, { maximumFractionDigits: digits });
    const vessel = (event: EventLike) => event.vesselName ?? String(event.mmsi);
    const related = (event: EventLike) =>
      event.relatedVesselName ?? (event.relatedMmsi === null ? '—' : String(event.relatedMmsi));
    const zone = (event: EventLike) =>
      event.zoneName ?? readZoneEventData(event.data).zoneName ?? t('common.unknownZone');
    const duration = (minutes: number | undefined) => {
      if (minutes === undefined) return '—';
      const parts = durationParts(minutes);
      return [
        parts.days > 0 ? t('duration.days', { count: parts.days }) : null,
        parts.hours > 0 ? t('duration.hours', { count: parts.hours }) : null,
        parts.minutes > 0 || (parts.days === 0 && parts.hours === 0)
          ? t('duration.minutes', { count: parts.minutes })
          : null,
      ]
        .filter(Boolean)
        .join(' ');
    };

    const title = (event: EventLike): string => {
      switch (event.type) {
        case 'transhipment':
          return t('text.transhipment.title', { a: vessel(event), b: related(event) });
        case 'fishing':
          return t('text.fishing.title', { vessel: vessel(event), zone: zone(event) });
        case 'dark':
          return t('text.dark.title', { vessel: vessel(event) });
        case 'anomaly':
          return t('text.anomaly.title', { vessel: vessel(event) });
        case 'geofence':
          return t('text.geofence.title', { vessel: vessel(event), zone: zone(event) });
        default:
          return event.title;
      }
    };

    const description = (event: EventLike): string => {
      switch (event.type) {
        case 'transhipment': {
          const data = readTranshipmentData(event.data);
          return t('text.transhipment.description', {
            a: vessel(event),
            b: related(event),
            score: num(data.accuracy),
          });
        }
        case 'fishing': {
          const data = readZoneEventData(event.data);
          return t('text.fishing.description', {
            sog: num(data.meanSogKn),
            rate: num(data.courseChangeRateDegPerMin),
            duration: duration(data.durationMin),
            zone: zone(event),
          });
        }
        case 'dark': {
          const data = readDarkData(event.data);
          return t('text.dark.description', {
            at: data.lastSeenAt ? formatDateTime(data.lastSeenAt, lang) : '—',
            sog: num(data.lastSogKn),
          });
        }
        case 'anomaly': {
          const data = readAnomalyData(event.data);
          const reported =
            data.navstatus !== undefined && isNavStatus(data.navstatus)
              ? NAV_STATUS_LABELS[data.navstatus][locale]
              : '—';
          const predicted =
            data.predictedNavstatus === undefined
              ? '—'
              : PREDICTED_NAV_STATUS_LABELS[data.predictedNavstatus][locale];
          return t('text.anomaly.description', {
            reported,
            predicted,
            streak: num(data.streak, 0),
          });
        }
        case 'geofence': {
          const data = readZoneEventData(event.data);
          const kind =
            data.zoneKind && isZoneKind(data.zoneKind)
              ? ZONE_KIND_LABELS[data.zoneKind][locale]
              : '—';
          return t('text.geofence.description', { zone: zone(event), kind });
        }
        default:
          return event.message;
      }
    };

    return { title, description };
  }, [t, lang, locale]);
}
