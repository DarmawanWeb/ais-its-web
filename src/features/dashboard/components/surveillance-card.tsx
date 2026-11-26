import { alertTypeLabel } from '@darmawanweb/ais-its-contracts/domain';
import { useTranslation } from 'react-i18next';

import type { SurveillanceStatsDto } from '@/shared/api/generated/surveillance/model';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';

import { useAppLanguage } from '@/shared/i18n';
import { SURVEILLANCE_METHOD, surveillanceRows } from '../lib/dashboard';

const COLORS = [
  'var(--chart-5)',
  'var(--chart-3)',
  'var(--chart-7)',
  'var(--chart-6)',
  'var(--chart-2)',
  'var(--chart-8)',
];

/** Surveillance events of the last 24 h per detector type (horizontal bars with counts). */
export function SurveillanceBreakdown({ stats }: { stats: SurveillanceStatsDto }) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = useAppLanguage();
  const rows = surveillanceRows(stats.byType);
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold tabular-nums">
          {formatNumber(stats.total, i18n.language)}
        </span>
        <span className="text-sm text-muted-foreground">
          {t('surveillance.events', { count: stats.total })} ·{' '}
          {t('surveillance.active', { count: stats.active })}
        </span>
      </div>
      <ul className="grid gap-3">
        {rows.map((row, index) => (
          <li key={row.type} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{alertTypeLabel(row.type, locale)}</span>
                {row.type in SURVEILLANCE_METHOD && (
                  <MethodInfo
                    methodId={SURVEILLANCE_METHOD[row.type as keyof typeof SURVEILLANCE_METHOD]}
                  />
                )}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {formatNumber(row.count, i18n.language)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  background: COLORS[index % COLORS.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
