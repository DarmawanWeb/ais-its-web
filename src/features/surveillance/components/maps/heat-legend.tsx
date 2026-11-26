import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { useResolvedTheme } from '@/shared/theme/theme';

import { HEAT_RANGES, heatGradientCss } from '../../lib/heat';

/** The heat ramp of the current theme as a bar (low → high density), with a border. */
export function HeatRampBar({ className }: { className?: string }) {
  const theme = useResolvedTheme();
  return (
    <span
      className={cn('inline-block h-2 w-16 shrink-0 rounded-full border', className)}
      style={{ background: heatGradientCss(HEAT_RANGES[theme]) }}
      aria-hidden
    />
  );
}

/** Inline legend of a heat layer: "low [ramp] high". */
export function HeatRampLegend({ className }: { className?: string }) {
  const { t } = useTranslation('surveillance');
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span>{t('map.legend.heatLow')}</span>
      <HeatRampBar />
      <span>{t('map.legend.heatHigh')}</span>
    </span>
  );
}
