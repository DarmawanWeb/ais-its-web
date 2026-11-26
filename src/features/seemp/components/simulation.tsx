import { ArrowRight, FlaskConical, Save, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  SeempMeasureDto,
  SeempScenarioResultDto,
  SeempSimulationDto,
} from '@/shared/api/generated/emission/model';
import {
  useSeempControllerCreateScenario,
  useSeempControllerSimulate,
} from '@/shared/api/generated/emission/seemp/seemp';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/sonner';
import { Spinner } from '@/shared/ui/spinner';

import { useInvalidateScenarios } from '../api/queries';
import { useMeasureText } from '../hooks/use-measure-text';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { co2Avoided, costPerPercent, costPerTonne } from '../lib/economics';
import { isGrade } from '../lib/grade-style';
import { groupByCategory, incompatibleCodes, inLegacyOrder } from '../lib/measures';
import { seempProblemKey } from '../lib/problems';
import { GradeChip, MethodChips, SeempProblemState } from './bits';
import { ReductionText } from './measures-catalog';

function Figure({
  label,
  value,
  hint,
  methodId,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  methodId?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {methodId && <MethodInfo methodId={methodId} />}
      </dt>
      <dd className={cn('font-mono tabular-nums', emphasis ? 'text-lg font-semibold' : 'text-sm')}>
        {value}
      </dd>
      {hint && <dd className="truncate font-mono text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Before → after CII, reduction, costs and cost–benefit of a simulation or saved scenario. */
export function SimulationResult({
  result,
  baselineCo2,
}: {
  /** A fresh simulation, or a saved scenario's snapshot (0.2 fields optional in older ones). */
  result: SeempSimulationDto | SeempScenarioResultDto;
  baselineCo2: number | null;
}) {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const before = isGrade(result.before.grade) ? result.before.grade : null;
  const after = isGrade(result.after.grade) ? result.after.grade : null;
  const perPercent = costPerPercent(result.costUsdPerYear, result.reductionPercent);
  const avoided = co2Avoided(baselineCo2, result.reductionPercent);
  const perTonne = costPerTonne(result.costUsdPerYear, avoided);
  const range = result.costRangeUsdPerYear;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border bg-surface p-4">
        <div className="flex min-w-0 items-center gap-3">
          <GradeChip grade={before} size="lg" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t('simulation.before', { year: result.baselineYear })}
            </p>
            <p className="font-mono text-sm tabular-nums">{format.cii(result.before.attained)}</p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {t('simulation.ratingShort')} {format.rating(result.before.rating)}
            </p>
          </div>
        </div>
        <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 items-center gap-3">
          <GradeChip grade={after} size="lg" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t('simulation.after', { year: result.targetYear })}
            </p>
            <p className="font-mono text-sm tabular-nums">{format.cii(result.after.attained)}</p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {t('simulation.ratingShort')} {format.rating(result.after.rating)}
            </p>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2">
        <Figure
          label={t('simulation.reduction')}
          value={format.percent(result.reductionPercent, 1)}
          methodId="seemp.simulation_combination"
          emphasis
        />
        <Figure
          label={t('simulation.costPerYear')}
          value={format.usd(result.costUsdPerYear)}
          hint={range.low !== range.high ? format.usdRange(range.low, range.high) : undefined}
          methodId="seemp.cost_amortization"
          emphasis
        />
        <Figure
          label={t('simulation.amortization')}
          value={t('recommendations.years', { count: result.yearsUntilInferior })}
        />
        <Figure
          label={t('simulation.costPerPercent')}
          value={perPercent === null ? '—' : format.usd(perPercent)}
        />
        <Figure
          label={t('simulation.co2Avoided')}
          value={avoided === null ? '—' : `${format.number(avoided, 1)} t`}
          hint={avoided === null ? t('simulation.co2Unknown') : undefined}
          methodId="emission.co2_conversion"
        />
        <Figure
          label={t('simulation.costPerTonne')}
          value={perTonne === null ? '—' : format.usd(perTonne)}
        />
      </dl>
      <div className="rounded-lg border px-3 py-2 text-xs">
        <p className="mb-1 font-medium text-muted-foreground">{t('simulation.fuelAfter')}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums">
          <span>ME {format.fixed(result.fuelAfter.meTon, 2)} t</span>
          <span>AE {format.fixed(result.fuelAfter.aeTon, 2)} t</span>
          <span>C_F {format.fixed(result.fuelAfter.conversionFactor, 3)}</span>
        </p>
      </div>
      <MethodChips methodIds={result.methodIds} />
    </div>
  );
}

/**
 * What-if simulation of a chosen set of measures (`POST …/simulate`, seemp:simulate) with the
 * projected CII and the cost–benefit, and saving it as a scenario.
 */
export function SimulationPanel({
  mmsi,
  measures,
  selected,
  onSelectedChange,
  year,
  targetYear,
  baselineCo2,
}: {
  mmsi: number;
  measures: readonly SeempMeasureDto[];
  selected: readonly string[];
  onSelectedChange: (codes: string[]) => void;
  year: number | null;
  targetYear: number | null;
  baselineCo2: number | null;
}) {
  const { t } = useTranslation('seemp');
  const measureText = useMeasureText();
  const simulate = useSeempControllerSimulate();
  const create = useSeempControllerCreateScenario();
  const invalidateScenarios = useInvalidateScenarios();
  const [name, setName] = useState('');
  const conflict = incompatibleCodes(selected, measures);
  const codes = inLegacyOrder(selected, measures);
  const years = { ...(year ? { year } : {}), ...(targetYear ? { targetYear } : {}) };
  const result = simulate.data;
  const stale =
    !!result &&
    (result.measureCodes.join(',') !== codes.join(',') ||
      simulate.variables?.mmsi !== String(String(mmsi)));

  const toggle = (code: string) =>
    onSelectedChange(
      selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code],
    );

  const run = () => {
    if (codes.length === 0 || conflict.length > 0) return;
    simulate.mutate({ mmsi: String(String(mmsi)), data: { measureCodes: codes, ...years } });
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ data: { mmsi, name: trimmed, measureCodes: codes, ...years } });
      await invalidateScenarios();
      toast.success(t('scenarios.saved', { name: trimmed }));
      setName('');
    } catch (error) {
      const key = seempProblemKey(error);
      toast.error(key ? t(`problems.${key}.title`) : t('scenarios.saveFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium">
          <span>{t('simulation.choose')}</span>
          {selected.length > 0 && (
            <Button type="button" size="xs" variant="ghost" onClick={() => onSelectedChange([])}>
              <X /> {t('simulation.clear')}
            </Button>
          )}
        </legend>
        {groupByCategory(measures).map((group) => (
          <div key={group.category} className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t(`categories.${group.category}`)}
            </p>
            <ul className="space-y-1">
              {group.measures.map((measure) => {
                const id = `simulate-${measure.code}`;
                const checked = selected.includes(measure.code);
                return (
                  <li
                    key={measure.code}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2',
                      checked
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-transparent hover:bg-muted/40',
                      conflict.includes(measure.code) && 'border-danger/60 bg-danger/5',
                    )}
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={() => toggle(measure.code)}
                      className="mt-0.5"
                    />
                    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block font-medium">
                        {measureText(measure.code, measure.name).name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        <ReductionText measure={measure} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </fieldset>
      {conflict.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertDescription>{t('simulation.incompatible')}</AlertDescription>
        </Alert>
      )}
      <Button
        onClick={run}
        disabled={codes.length === 0 || conflict.length > 0 || simulate.isPending}
      >
        {simulate.isPending ? <Spinner /> : <FlaskConical />}
        {t('simulation.run', { count: codes.length })}
      </Button>
      {simulate.isError && <SeempProblemState error={simulate.error} size="sm" />}
      {result && (
        <section
          aria-live="polite"
          aria-labelledby="simulation-result"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="simulation-result" className="flex items-center gap-1 text-sm font-semibold">
              {t('simulation.result')}
              <MethodInfo methodId="seemp.simulation_combination" />
            </h3>
            {stale && <span className="text-xs text-warning">{t('simulation.stale')}</span>}
          </div>
          <SimulationResult result={result} baselineCo2={baselineCo2} />
          <form
            className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="scenario-name">{t('scenarios.name')}</Label>
              <Input
                id="scenario-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('scenarios.namePlaceholder')}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!name.trim() || stale || create.isPending}
            >
              {create.isPending ? <Spinner /> : <Save />} {t('scenarios.save')}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
