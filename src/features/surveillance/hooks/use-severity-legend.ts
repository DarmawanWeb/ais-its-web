import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { LegendItem } from '@/shared/map';
import { rgbaToCss } from '@/shared/theme/tokens';

import { severityColor } from '../lib/map-style';

/** Severity legend: colour, size and fill (open vs ended) are all explained. */
export function useSeverityLegend(): LegendItem[] {
  const { t } = useTranslation('surveillance');
  return useMemo(
    () => [
      {
        label: t('map.legend.critical'),
        color: rgbaToCss(severityColor('critical')),
        shape: 'dot',
      },
      { label: t('map.legend.warning'), color: rgbaToCss(severityColor('warning')), shape: 'dot' },
      { label: t('map.legend.info'), color: rgbaToCss(severityColor('info')), shape: 'dot' },
      { label: t('map.legend.ended'), color: 'var(--muted-foreground)', shape: 'ring' },
    ],
    [t],
  );
}
