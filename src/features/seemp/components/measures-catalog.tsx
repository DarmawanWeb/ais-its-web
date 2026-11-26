import { BookMarked, CircleDollarSign, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SeempMeasureDto } from '@/shared/api/generated/emission/model';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { cn } from '@/shared/lib/utils';

import { useMeasureText } from '../hooks/use-measure-text';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { costOf, groupByCategory, reductionOf } from '../lib/measures';
import { CategoryIcon } from './bits';

/** Text of a measure's reduction model (type 1 operational, 2 fuel switch, 3 auxiliary energy). */
export function ReductionText({ measure }: { measure: SeempMeasureDto }) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const reduction = reductionOf(measure);
  if (!reduction) return <span className="text-muted-foreground">—</span>;
  switch (reduction.type) {
    case 'operational':
      return <>{t('reduction.operational', { p: format.number(reduction.potentialPercent, 2) })}</>;
    case 'fuel_switch':
      return <>{t('reduction.fuelSwitch', { cf: format.fixed(reduction.conversionFactor, 2) })}</>;
    case 'auxiliary':
      return reduction.coldIroning ? (
        <>
          {t('reduction.coldIroning', { share: format.number(reduction.potentialShare * 100, 1) })}
        </>
      ) : (
        <>{t('reduction.auxiliary', { share: format.number(reduction.potentialShare * 100, 1) })}</>
      );
  }
}

/** Text of a measure's cost model (LOA bands, range, per m², per kW). */
export function CostText({ measure }: { measure: SeempMeasureDto }) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const cost = costOf(measure);
  if (!cost) return <span className="text-muted-foreground">—</span>;
  switch (cost.type) {
    case 'loa_bands':
      return (
        <ul className="space-y-0.5">
          {cost.bands.map((band, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {band.maxLoaM === null
                  ? t('cost.loaAbove', { m: cost.bands[index - 1]?.maxLoaM ?? 0 })
                  : t('cost.loaUpTo', { m: band.maxLoaM })}
              </span>
              <span className="font-mono tabular-nums">{format.usd(band.usd)}</span>
            </li>
          ))}
        </ul>
      );
    case 'range':
      return (
        <span className="font-mono tabular-nums">{format.usdRange(cost.lowUsd, cost.highUsd)}</span>
      );
    case 'wetted_surface':
      return <>{t('cost.wettedSurface', { usd: format.usd(cost.usdPerM2) })}</>;
    case 'installed_power':
      return (
        <>
          {t(
            cost.mainEngine && cost.auxEngines
              ? 'cost.powerBoth'
              : cost.mainEngine
                ? 'cost.powerMain'
                : 'cost.powerAux',
            { usd: format.usd(cost.usdPerKw) },
          )}
          {cost.fixedUsd > 0 && ` + ${format.usd(cost.fixedUsd)}`}
        </>
      );
  }
}

function MeasureCard({ measure }: { measure: SeempMeasureDto }) {
  const { t } = useTranslation('seemp');
  const text = useMeasureText()(measure.code, measure.name);
  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs"
      aria-labelledby={`measure-${measure.code}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <CategoryIcon category={measure.category} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4
            id={`measure-${measure.code}`}
            className="flex items-start gap-1 leading-snug font-semibold"
          >
            <span>{text.name}</span>
            <MethodInfo methodId={measure.methodId} />
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('catalog.legacyOrder', { order: measure.legacyOrder })} ·{' '}
            <span className="font-mono">{measure.code}</span>
          </p>
        </div>
      </div>
      {text.description && <p className="text-sm text-muted-foreground">{text.description}</p>}
      <dl className="grid gap-2 text-sm">
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <TrendingDown className="size-3.5" aria-hidden /> {t('catalog.savings')}
          </dt>
          <dd className="mt-0.5">
            <ReductionText measure={measure} />
          </dd>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <CircleDollarSign className="size-3.5" aria-hidden /> {t('catalog.investment')}
          </dt>
          <dd className="mt-0.5">
            <CostText measure={measure} />
          </dd>
        </div>
      </dl>
      <p className="mt-auto flex items-start gap-1.5 border-t pt-2 text-[11px] break-words text-muted-foreground">
        <BookMarked className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>
          {t('catalog.source')}: {measure.source}
        </span>
      </p>
    </article>
  );
}

/** The 12 SEEMP measures grouped by category, with reduction, cost and source. */
export function MeasuresCatalog({
  measures,
  className,
}: {
  measures: readonly SeempMeasureDto[];
  className?: string;
}) {
  const { t } = useTranslation('seemp');
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {groupByCategory(measures).map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-${group.category}`}
          className="space-y-3"
        >
          <h3
            id={`category-${group.category}`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <CategoryIcon category={group.category} className="size-4 text-primary" />
            {t(`categories.${group.category}`)}
            <span className="font-normal text-muted-foreground">({group.measures.length})</span>
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
            {group.measures.map((measure) => (
              <MeasureCard key={measure.code} measure={measure} />
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{t('catalog.note')}</p>
    </div>
  );
}
