import {
  ArrowLeft,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  Leaf,
  ListChecks,
  Ship,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';

import { Can, RequirePermission, usePermission } from '@/shared/auth';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText } from '@/shared/domain-ui/values';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useBaselineCo2, useMeasures, useRecommendations, useVesselIdentity } from '../api/queries';
import { GradeChip, MethodChips, SeempProblemState, YearPicker } from '../components/bits';
import { RecommendationsList } from '../components/recommendations';
import { ScenariosTable } from '../components/scenarios';
import { SimulationPanel } from '../components/simulation';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { isGrade } from '../lib/grade-style';

const FIRST_YEAR = 2023;
const LAST_TARGET_YEAR = 2030;

function parseOptionalYear(value: string | null, min: number, max: number): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= min && year <= max ? year : null;
}

/** SEEMP of one vessel: baseline, ranked recommendations, what-if simulation, saved scenarios. */
export function SeempVesselPage() {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const { mmsi: param } = useParams();
  const mmsi = /^\d{9}$/.test(param ?? '') ? Number(param) : 0;
  const [params, setParams] = useSearchParams();
  const thisYear = new Date().getUTCFullYear();
  const year = parseOptionalYear(params.get('year'), 2000, thisYear);
  const targetYear = parseOptionalYear(params.get('target'), FIRST_YEAR, LAST_TARGET_YEAR);
  const [selected, setSelected] = useState<string[]>([]);
  const canSimulate = usePermission('seemp:simulate');
  const vessel = useVesselIdentity(mmsi);
  const measures = useMeasures();
  const recommendations = useRecommendations(mmsi, {
    ...(year ? { year } : {}),
    ...(targetYear ? { targetYear } : {}),
  });
  const data = recommendations.data;
  const baselineCo2 = useBaselineCo2(mmsi, data?.baselineYear);

  const setYearParam = (key: string, value: number | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };

  if (!mmsi) {
    return (
      <EmptyState
        icon={Ship}
        title={t('vessel.invalidTitle')}
        description={t('vessel.invalidDescription')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/seemp">
              <ArrowLeft /> {t('vessel.back')}
            </Link>
          </Button>
        }
      />
    );
  }

  const baselineYears = Array.from(
    { length: thisYear - FIRST_YEAR + 1 },
    (_, index) => thisYear - index,
  );
  const targetYears = Array.from(
    { length: LAST_TARGET_YEAR - Math.min(thisYear, LAST_TARGET_YEAR) + 1 },
    (_, index) => Math.min(thisYear, LAST_TARGET_YEAR) + index,
  );
  const gradeBefore = data && isGrade(data.ciiGradeBefore) ? data.ciiGradeBefore : null;
  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/seemp"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t('vessel.back')}
        </Link>
      </div>
      <PageHeader
        eyebrow={t('seemp.title')}
        icon={ClipboardCheck}
        title={vessel?.name ?? t('vessel.fallbackTitle', { mmsi })}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              MMSI <MmsiText mmsi={mmsi} copyable />
            </span>
            {vessel?.type && <span>{vessel.type.name}</span>}
          </span>
        }
        actions={
          <>
            <YearPicker
              id="seemp-baseline-year"
              label={t('vessel.baselineYear')}
              value={year}
              years={baselineYears}
              autoLabel={t('vessel.auto')}
              onChange={(value) => setYearParam('year', value)}
            />
            <YearPicker
              id="seemp-target-year"
              label={t('vessel.targetYear')}
              value={targetYear}
              years={targetYears}
              autoLabel={t('vessel.auto')}
              onChange={(value) => setYearParam('target', value)}
            />
            <Can permission="cii:read">
              <Button asChild size="sm" variant="outline">
                <Link to={`/cii/vessels/${mmsi}`}>
                  <Leaf /> {t('vessel.cii')}
                </Link>
              </Button>
            </Can>
          </>
        }
      />

      {recommendations.isPending ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : recommendations.isError || !data ? (
        <div className="rounded-xl border bg-surface">
          <SeempProblemState
            error={recommendations.error}
            onRetry={() => void recommendations.refetch()}
            action={
              <Can permission="cii:read">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/cii/vessels/${mmsi}?tab=history`}>
                    <Leaf /> {t('vessel.openCii')}
                  </Link>
                </Button>
              </Can>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
            <StatCard
              label={t('baseline.attained', { year: data.baselineYear })}
              value={format.cii(data.ciiAttained)}
              unit={t('units.cii')}
              icon={Gauge}
              tone="primary"
              methodId="cii.attained_accumulation"
              footer={
                data.baselineSource === 'manual' ? (
                  <Badge variant="warning" className="w-fit">
                    {t('baseline.manual')}
                  </Badge>
                ) : undefined
              }
            />
            <StatCard
              label={t('baseline.required', { year: data.targetYear })}
              value={format.cii(data.ciiRequired)}
              unit={t('units.cii')}
              icon={Target}
              methodId="cii.required"
            />
            <StatCard
              label={t('baseline.rating')}
              value={format.rating(data.ciiRatingBefore)}
              icon={TrendingUp}
              methodId="cii.rating_grade"
              description={t('baseline.ratingDescription', { year: data.targetYear - 1 })}
            />
            <div className="flex items-center gap-4 rounded-xl border bg-surface p-4 shadow-xs">
              <GradeChip grade={gradeBefore} size="lg" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  {t('baseline.grade')} <MethodInfo methodId="cii.rating_grade" />
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('baseline.gradeDescription', { year: data.targetYear - 1 })}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Section
              title={
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-4 text-primary" aria-hidden />{' '}
                  {t('recommendations.title')}
                  <MethodInfo methodId="seemp.filter_sort_output" />
                </span>
              }
              description={t('recommendations.description', { year: data.targetYear })}
              className="min-w-0"
            >
              {data.recommendations.length === 0 ? (
                <EmptyState
                  size="sm"
                  title={t('recommendations.emptyTitle')}
                  description={t('recommendations.emptyDescription')}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <RecommendationsList
                    data={data}
                    measures={measures.data?.data ?? []}
                    selectable={canSimulate}
                    selected={selected}
                    onToggle={toggle}
                  />
                  <MethodChips methodIds={data.methodIds} />
                </div>
              )}
            </Section>
            <RequirePermission
              permission="seemp:simulate"
              fallback={
                <Section title={t('simulation.title')} className="min-w-0">
                  <EmptyState
                    size="sm"
                    icon={FlaskConical}
                    title={t('simulation.readOnlyTitle')}
                    description={t('simulation.readOnlyDescription')}
                  />
                </Section>
              }
            >
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <FlaskConical className="size-4 text-primary" aria-hidden />{' '}
                    {t('simulation.title')}
                    <MethodInfo methodId="seemp.simulation_combination" />
                  </span>
                }
                description={t('simulation.description')}
                className="min-w-0 xl:sticky xl:top-20"
              >
                {measures.isPending ? (
                  <Skeleton className="h-96 w-full" />
                ) : measures.isError ? (
                  <SeempProblemState
                    error={measures.error}
                    size="sm"
                    onRetry={() => void measures.refetch()}
                  />
                ) : (
                  <SimulationPanel
                    mmsi={mmsi}
                    measures={measures.data.data}
                    selected={selected}
                    onSelectedChange={setSelected}
                    year={year}
                    targetYear={targetYear}
                    baselineCo2={baselineCo2}
                  />
                )}
              </Section>
            </RequirePermission>
          </div>
        </>
      )}

      <Section
        title={t('scenarios.vesselTitle')}
        description={t('scenarios.vesselDescription')}
        className="min-w-0"
        contentClassName="min-w-0"
      >
        <ScenariosTable mmsi={mmsi} measures={measures.data?.data ?? []} />
      </Section>
    </div>
  );
}
