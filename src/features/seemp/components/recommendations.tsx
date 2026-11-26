import { CalendarRange, CircleDollarSign, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type {
  SeempMeasureDto,
  SeempRecommendationDto,
  SeempRecommendationsDto,
} from '@/shared/api/generated/emission/model';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/checkbox';

import { useMeasureText } from '../hooks/use-measure-text';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { reductionPercent } from '../lib/economics';
import { isGrade } from '../lib/grade-style';
import { CategoryBadge, GradeChange } from './bits';

function RecommendationItem({
  rank,
  item,
  baseline,
  measure,
  selectable,
  selected,
  onToggle,
}: {
  rank: number;
  item: SeempRecommendationDto;
  baseline: SeempRecommendationsDto;
  measure: SeempMeasureDto | undefined;
  selectable: boolean;
  selected: boolean;
  onToggle: (code: string) => void;
}) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const text = useMeasureText()(item.code, item.recommendation);
  const reduction = reductionPercent(baseline.ciiAttained, item.ciiAttainedAfter);
  const before = isGrade(item.ciiGradeBefore)
    ? item.ciiGradeBefore
    : isGrade(baseline.ciiGradeBefore)
      ? baseline.ciiGradeBefore
      : null;
  const after = isGrade(item.ciiGradeAfter) ? item.ciiGradeAfter : null;
  const range = item.costRangeUsdPerYear;
  const checkboxId = `recommendation-${item.code}`;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-surface p-4 transition-colors sm:flex-row sm:items-start',
        selected && 'border-primary/60 bg-primary/5',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold">
        <span aria-hidden>{rank}</span>
        <span className="sr-only">{t('recommendations.rank', { rank })}</span>
      </span>
      <div className="@container min-w-0 flex-1 space-y-2">
        <div className="min-w-0">
          <h3 className="flex items-start gap-1 leading-snug font-semibold">
            <span>{text.name}</span>
            {item.methodIds.slice(0, 1).map((id) => (
              <MethodInfo key={id} methodId={id} />
            ))}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {measure && <CategoryBadge category={measure.category} />}
            <GradeChange before={before} after={after} size="md" />
          </div>
        </div>
        {text.description && <p className="text-sm text-muted-foreground">{text.description}</p>}
        {/* Four figures side by side only when the card itself is wide enough. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm @lg:grid-cols-4">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingDown className="size-3.5" aria-hidden /> {t('recommendations.reduction')}
            </dt>
            <dd className="font-mono font-semibold tabular-nums">
              {reduction === null ? '—' : format.percent(-reduction, 1)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              {t('recommendations.ratingAfter')}
              <MethodInfo methodId="cii.rating_grade" />
            </dt>
            <dd className="font-mono tabular-nums">{format.rating(item.ciiRatingAfter)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CircleDollarSign className="size-3.5" aria-hidden />{' '}
              {t('recommendations.costPerYear')}
              <MethodInfo methodId="seemp.cost_amortization" />
            </dt>
            <dd className="font-mono tabular-nums">{format.usd(item.costUsdPerYear)}</dd>
            {range.low !== range.high && (
              <dd className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {format.usdRange(range.low, range.high)}
              </dd>
            )}
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarRange className="size-3.5" aria-hidden /> {t('recommendations.amortization')}
            </dt>
            <dd className="font-mono tabular-nums">
              {t('recommendations.years', { count: item.yearsUntilInferior })}
            </dd>
          </div>
        </dl>
      </div>
      {selectable && (
        <div className="flex items-center gap-2 sm:pt-1">
          <Checkbox
            id={checkboxId}
            checked={selected}
            onCheckedChange={() => onToggle(item.code)}
          />
          <label
            htmlFor={checkboxId}
            className="cursor-pointer text-xs font-medium whitespace-nowrap"
          >
            {t('recommendations.select')}
          </label>
        </div>
      )}
    </li>
  );
}

/** Measures that keep the vessel at grades A–C, cheapest per year first (legacy ranking). */
export function RecommendationsList({
  data,
  measures,
  selectable,
  selected,
  onToggle,
}: {
  data: SeempRecommendationsDto;
  measures: readonly SeempMeasureDto[];
  selectable: boolean;
  selected: readonly string[];
  onToggle: (code: string) => void;
}) {
  const { t } = useTranslation('seemp');
  const byCode = new Map(measures.map((measure) => [measure.code, measure]));
  return (
    <ol className="flex flex-col gap-3" aria-label={t('recommendations.title')}>
      {data.recommendations.map((item, index) => (
        <RecommendationItem
          key={item.code}
          rank={index + 1}
          item={item}
          baseline={data}
          measure={byCode.get(item.code)}
          selectable={selectable}
          selected={selected.includes(item.code)}
          onToggle={onToggle}
        />
      ))}
    </ol>
  );
}
