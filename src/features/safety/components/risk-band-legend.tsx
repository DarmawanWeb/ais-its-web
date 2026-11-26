import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { rgbaToCss, SAFETY_COLORS } from '@/shared/theme/tokens';
import { Badge } from '@/shared/ui/badge';

import { LOW_RISK_COLOR } from '../lib/colors';
import type { CollisionThresholds } from '../lib/thresholds';

/**
 * Risk bands of the collision detector (spec §13.7) with the active limits: colour and ring
 * style match the live map (high solid magenta, medium dashed pink), low has no alert.
 */
export function RiskBandLegend({
  thresholds,
  className,
  compact = false,
}: {
  thresholds: CollisionThresholds;
  className?: string;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation('safety');
  const titleId = useId();
  const number = (value: number, digits = 2) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: digits });
  const bands = [
    {
      key: 'high',
      color: rgbaToCss(SAFETY_COLORS.collisionHigh),
      dashed: false,
      width: 3,
      alert: t('collision.bands.alertCritical'),
      limits: thresholds.high,
    },
    {
      key: 'medium',
      color: rgbaToCss(SAFETY_COLORS.collisionMedium),
      dashed: true,
      width: 2,
      alert: t('collision.bands.alertWarning'),
      limits: thresholds.medium,
    },
    {
      key: 'low',
      color: rgbaToCss(LOW_RISK_COLOR),
      dashed: false,
      width: 1.5,
      alert: t('collision.bands.alertNone'),
      limits: thresholds.low,
    },
  ] as const;

  return (
    <section
      aria-labelledby={titleId}
      className={cn('rounded-xl border bg-surface p-4 shadow-xs', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold">
          {t('collision.bands.title')}
          <MethodInfo methodId="collision.cpa_tcpa" />
        </h2>
        <Badge variant={thresholds.source === 'detector' ? 'success' : 'muted'}>
          {thresholds.source === 'detector'
            ? t('collision.bands.active')
            : t('collision.bands.defaults')}
        </Badge>
      </div>
      <ul className={cn('mt-3 grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-3')}>
        {bands.map((band) => (
          <li
            key={band.key}
            className="flex items-start gap-3 rounded-lg border bg-background/40 px-3 py-2.5"
          >
            <span
              aria-hidden
              className="mt-0.5 size-4 shrink-0 rounded-full"
              style={{
                border: `${band.width}px ${band.dashed ? 'dashed' : 'solid'} ${band.color}`,
                backgroundColor: band.color.replace(/[\d.]+\)$/, '0.18)'),
              }}
            />
            <div className="min-w-0 text-xs">
              <p className="text-sm font-semibold">{t(`collision.bands.${band.key}`)}</p>
              <p className="font-mono text-foreground tabular-nums">
                {t('collision.bands.limits', {
                  cpa: number(band.limits.cpaNm),
                  tcpa: number(band.limits.tcpaMin, 1),
                })}
              </p>
              <p className="text-muted-foreground">{band.alert}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t('collision.bands.hysteresis', {
          percent: number(thresholds.hysteresis * 100, 0),
          radius: number(thresholds.searchRadiusNm, 1),
          sog: number(thresholds.minSogKn, 1),
        })}
      </p>
    </section>
  );
}
