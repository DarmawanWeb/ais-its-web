import { CII_GRADES, type CiiGrade } from '@darmawanweb/ais-its-contracts/domain';
import { Fuel } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { FleetSummaryDto } from '@/shared/api/generated/emission/model';
import { CiiGradeBadge } from '@/shared/domain-ui/badges';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

import { gradeShares } from '../lib/dashboard';

const GRADE_BG: Record<CiiGrade, string> = {
  A: 'bg-grade-a',
  B: 'bg-grade-b',
  C: 'bg-grade-c',
  D: 'bg-grade-d',
  E: 'bg-grade-e',
};

/** CII grade distribution of the fleet (bars A–E) and the fuel burnt this month / year. */
export function EmissionsCard({
  summary,
  fuel,
  fuelError,
}: {
  summary: FleetSummaryDto;
  /** Totals of `GET /cii/fleet/fuel` (t); `vessels` = vessels with data this year. */
  fuel: { month: number; year: number; pending: boolean; vessels: number };
  fuelError?: unknown;
}) {
  const { t, i18n } = useTranslation('dashboard');
  const { rated, shares } = gradeShares(summary.grades);
  const largest = Math.max(...CII_GRADES.map((grade) => summary.grades[grade]), 1);
  const n = (value: number, digits = 0) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: digits });
  return (
    <div className="flex flex-col gap-5">
      <div
        className="grid grid-cols-5 items-end gap-2"
        role="list"
        aria-label={t('emissions.distribution')}
      >
        {CII_GRADES.map((grade) => (
          <div key={grade} role="listitem" className="flex flex-col items-center gap-2">
            <span className="font-mono text-sm font-medium tabular-nums">
              {n(summary.grades[grade])}
            </span>
            <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-muted/50">
              <div
                className={cn('w-full rounded-t-md transition-[height]', GRADE_BG[grade])}
                style={{
                  height: `${Math.max((summary.grades[grade] / largest) * 100, summary.grades[grade] > 0 ? 6 : 0)}%`,
                }}
                aria-hidden
              />
            </div>
            <CiiGradeBadge grade={grade} size="sm" />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {n(shares[grade] * 100)}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('emissions.rated', { rated, total: summary.vessels })}
        {summary.notAvailable > 0 &&
          ` · ${t('emissions.notAvailable', { count: summary.notAvailable })}`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['month', fuel.month],
            ['year', fuel.year],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-lg border bg-muted/20 p-3">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Fuel className="size-3.5 text-primary" aria-hidden />
              {t(`emissions.fuel.${key}`)}
              <MethodInfo methodId="fuel.method_selection" />
            </p>
            {fuel.pending ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : fuelError ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('stats.unavailable')}</p>
            ) : (
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {n(value, 1)}{' '}
                <span className="font-sans text-sm font-normal text-muted-foreground">t</span>
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-muted-foreground">
          {t('emissions.fuelNote', { count: fuel.vessels })}
        </p>
        <DataAttribution provider="open-meteo" />
      </div>
    </div>
  );
}
