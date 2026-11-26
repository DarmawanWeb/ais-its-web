import {
  PREDICTED_NAV_STATUS_LABELS,
  ZONE_KIND_LABELS,
  isZoneKind,
} from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import { NavstatusLabel } from '@/shared/domain-ui/badges';
import type { KeyValueItem } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';

import {
  darkGapMinutes,
  readAnomalyData,
  readDarkData,
  readDarkResolution,
  readTranshipmentData,
  readZoneEventData,
} from '../lib/event-data';
import type { SurveillanceEvent } from '../lib/dto';
import { DurationText } from '../components/bits';

function zoneKindText(kind: string | undefined, locale: 'id' | 'en') {
  return kind && isZoneKind(kind) ? ZONE_KIND_LABELS[kind][locale] : (kind ?? '—');
}

/** Detector-specific figures of an event, each computed value with its method popover. */
export function useEventDetailItems(event: SurveillanceEvent): KeyValueItem[] {
  const { t, i18n } = useTranslation('surveillance');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const dt = (value: string | null | undefined) =>
    value ? formatDateTime(value, i18n.language) : '—';
  const n = (value: number | undefined | null, digits = 1) =>
    value === undefined || value === null
      ? '—'
      : formatNumber(value, i18n.language, { maximumFractionDigits: digits });

  switch (event.type) {
    case 'dark': {
      const data = readDarkData(event.data);
      const resolution = readDarkResolution(event.resolution);
      return [
        { key: 'lastSeen', label: t('fields.lastSeenAt'), value: dt(data.lastSeenAt) },
        {
          key: 'gap',
          label: t('fields.gapDuration'),
          hint: <MethodInfo methodId="dark.ais_gap" />,
          value: (
            <span className="inline-flex items-center gap-1.5">
              <DurationText minutes={darkGapMinutes(event)} />
              {event.resolvedAt === null && (
                <Badge variant="warning">{t('fields.gapGrowing')}</Badge>
              )}
            </span>
          ),
        },
        {
          key: 'sog',
          label: t('fields.lastSog'),
          value: <UnitValue value={data.lastSogKn} unit="knots" />,
        },
        {
          key: 'cog',
          label: t('fields.lastCog'),
          value: <UnitValue value={data.lastCogDeg} unit="deg" />,
        },
        {
          key: 'harbour',
          label: t('fields.nearestHarbour'),
          hint: <MethodInfo methodId="dark.ais_gap" />,
          value:
            data.nearestHarbourM === null || data.nearestHarbourM === undefined ? (
              <span className="text-muted-foreground">{t('fields.noHarbour')}</span>
            ) : (
              <UnitValue value={data.nearestHarbourM / 1000} unit="km" digits={1} />
            ),
        },
        ...(event.resolvedAt
          ? [
              {
                key: 'reappeared',
                label: t('fields.reappearedAt'),
                value: dt(resolution.reappearedAt ?? event.resolvedAt),
              },
            ]
          : []),
      ];
    }
    case 'anomaly': {
      const data = readAnomalyData(event.data);
      return [
        {
          key: 'reported',
          label: t('fields.reportedNavstatus'),
          value: <NavstatusLabel code={data.navstatus} showCode />,
        },
        {
          key: 'predicted',
          label: t('fields.predictedNavstatus'),
          hint: <MethodInfo methodId="anomaly.navstatus_mismatch" />,
          value:
            data.predictedNavstatus === undefined
              ? '—'
              : PREDICTED_NAV_STATUS_LABELS[data.predictedNavstatus][locale],
        },
        {
          key: 'streak',
          label: t('fields.streak'),
          value: t('fields.streakValue', {
            streak: n(data.streak, 0),
            min: n(data.minPositions, 0),
          }),
        },
        {
          key: 'sog',
          label: t('fields.sog'),
          value: <UnitValue value={data.sogKn} unit="knots" />,
        },
      ];
    }
    case 'fishing':
    case 'geofence': {
      const data = readZoneEventData(event.data);
      const items: KeyValueItem[] = [
        { key: 'zone', label: t('fields.zone'), value: event.zoneName ?? data.zoneName ?? '—' },
        { key: 'kind', label: t('fields.zoneKind'), value: zoneKindText(data.zoneKind, locale) },
      ];
      if (event.type === 'geofence') {
        return [
          ...items,
          {
            key: 'sog',
            label: t('fields.sogAtEntry'),
            hint: <MethodInfo methodId="geo.geofence_enter" />,
            value: <UnitValue value={data.sogKn} unit="knots" />,
          },
        ];
      }
      return [
        ...items,
        {
          key: 'duration',
          label: t('fields.loiterDuration'),
          hint: <MethodInfo methodId="fishing.loitering" />,
          value: <DurationText minutes={data.durationMin} />,
        },
        { key: 'positions', label: t('fields.positions'), value: n(data.positions, 0) },
        {
          key: 'meanSog',
          label: t('fields.meanSog'),
          value: <UnitValue value={data.meanSogKn} unit="knots" />,
        },
        {
          key: 'rate',
          label: t('fields.courseChangeRate'),
          hint: <MethodInfo methodId="fishing.loitering" />,
          value:
            data.courseChangeRateDegPerMin === undefined
              ? '—'
              : t('fields.degPerMin', { value: n(data.courseChangeRateDegPerMin) }),
        },
        {
          key: 'total',
          label: t('fields.totalCourseChange'),
          value: <UnitValue value={data.totalCourseChangeDeg} unit="deg" />,
        },
      ];
    }
    case 'transhipment': {
      const data = readTranshipmentData(event.data);
      return [
        {
          key: 'accuracy',
          label: t('fields.accuracy'),
          hint: <MethodInfo methodId="transhipment.accuracy" />,
          value: <UnitValue value={data.accuracy} unit="percent" digits={2} />,
        },
        {
          key: 'averagePriority',
          label: t('fields.averagePriority'),
          hint: <MethodInfo methodId="transhipment.priority_distribution" />,
          value: n(data.averagePriority, 2),
        },
        {
          key: 'accumulated',
          label: t('fields.accumulatedPriority'),
          hint: <MethodInfo methodId="transhipment.candidate_queue" />,
          value: n(data.accumulatedPriority, 0),
        },
        {
          key: 'window',
          label: t('fields.window'),
          value: `${dt(data.startTimestamp)} – ${dt(data.endTimestamp)}`,
        },
      ];
    }
    default:
      return [];
  }
}
