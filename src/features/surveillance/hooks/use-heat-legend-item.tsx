import { useTranslation } from 'react-i18next';

import type { LegendItem } from '@/shared/map';
import { useResolvedTheme } from '@/shared/theme/theme';

import { HeatRampBar } from '../components/maps/heat-legend';
import { HEAT_RANGES } from '../lib/heat';

/** Map legend entry of a heat layer (the label carries the theme's ramp). */
export function useHeatLegendItem(): LegendItem {
  const { t } = useTranslation('surveillance');
  const theme = useResolvedTheme();
  const [r, g, b] = HEAT_RANGES[theme][3] ?? [139, 92, 246];
  return {
    label: (
      <span className="inline-flex items-center gap-1.5">
        {t('map.legend.density')} <HeatRampBar className="w-12" />
      </span>
    ),
    color: `rgb(${r}, ${g}, ${b})`,
    shape: 'square',
  };
}
