import { ZONE_KIND_LABELS, isZoneKind } from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';

import type { SurveillanceType } from '../lib/types';
import type { DetectorThresholds } from './use-detector';

function useKindList() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'id';
  return (kinds: readonly string[]) =>
    kinds.map((kind) => (isZoneKind(kind) ? ZONE_KIND_LABELS[kind][locale] : kind)).join(', ');
}

/** Interpolation values of a detector's rule text, read from its active configuration. */
export function useRuleValues(type: SurveillanceType, thresholds: DetectorThresholds) {
  const { i18n } = useTranslation();
  const kindList = useKindList();
  const n = (value: number) => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  const { number, list } = thresholds;
  switch (type) {
    case 'transhipment':
      return {
        sources: list('SOURCES', ['batam']).join(', '),
        zoneKinds: kindList(list('ZONE_KINDS', ['transhipment_area'])),
        radius: n(number('NEIGHBOUR_RADIUS_M', 600)),
        window: n(number('NEIGHBOUR_WINDOW_MIN', 5)),
        threshold: n(number('ACCURACY_THRESHOLD', 70)),
        critical: n(number('CRITICAL_ACCURACY', 90)),
      };
    case 'fishing':
      return {
        minDuration: n(number('MIN_DURATION_MIN', 30)),
        minPositions: n(number('MIN_POSITIONS', 6)),
        minSog: n(number('MIN_SOG_KN', 0.5)),
        maxSog: n(number('MAX_SOG_KN', 4)),
        rate: n(number('MIN_COURSE_CHANGE_DEG_PER_MIN', 3)),
        kinds: kindList(list('ZONE_KINDS', ['fishing_ground', 'restricted'])),
      };
    case 'dark':
      return {
        gap: n(number('GAP_MIN', 30)),
        sog: n(number('MIN_SOG_KN', 1)),
        distance: n(number('HARBOUR_DISTANCE_KM', 5)),
        kinds: kindList(list('HARBOUR_ZONE_KINDS', ['port', 'anchorage'])),
        maxGap: n(number('MAX_GAP_H', 24)),
      };
    case 'anomaly':
      return { minPositions: n(number('MIN_POSITIONS', 3)) };
    case 'geofence':
      return { kinds: kindList(list('KINDS', ['restricted', 'mpa', 'custom'])) };
  }
}
