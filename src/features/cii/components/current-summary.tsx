import { CII_GRADE_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { CalendarClock, Fuel, Gauge, Route, Target, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { CiiSummaryDto } from '@/shared/api/generated/emission/model';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { UnitValue } from '@/shared/domain-ui/values';
import { cn } from '@/shared/lib/utils';
import { Progress } from '@/shared/ui/progress';

import { useCiiFormat } from '../hooks/use-cii-format';
import { isGrade } from '../lib/grades';
import { type FUEL_METHODS, methodShares, usesWeather } from '../lib/segments';
import { CiiUnit, FuelMethodBadge, MethodChips, SourceBadge } from './bits';
import { GradeChip, RatingScale } from './grade';

const METHOD_BAR: Record<(typeof FUEL_METHODS)[number], string> = {
  telemetry: 'bg-chart-4',
  first_formula: 'bg-chart-1',
  holtrop: 'bg-chart-3',
};

function MethodMix({ summary }: { summary: CiiSummaryDto }) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const shares = methodShares(summary.methods);
  const total = shares.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">{t('totals.noMethods')}</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {shares
          .filter((item) => item.count > 0)
          .map((item) => (
            <span
              key={item.method}
              className={cn('h-full', METHOD_BAR[item.method])}
              style={{ width: `${item.share * 100}%` }}
            />
          ))}
      </div>
      <ul className="grid gap-1 text-xs">
        {shares.map((item) => (
          <li key={item.method} className="flex items-center gap-2">
            <span
              className={cn('size-2.5 shrink-0 rounded-sm', METHOD_BAR[item.method])}
              aria-hidden
            />
            <span className="text-muted-foreground">{t(`methods.${item.method}`)}</span>
            <span className="ml-auto font-mono tabular-nums">
              {format.number(item.count)} · {format.percent(item.share * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Year-to-date figures of a vessel: grade, attained, required, rating, scale, totals, projection. */
export function CurrentSummary({ summary }: { summary: CiiSummaryDto }) {
  const { t, i18n } = useTranslation('cii');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const format = useCiiFormat();
  const grade = isGrade(summary.grade) ? summary.grade : null;
  const projection = summary.projection;
  const projectedGrade = projection && isGrade(projection.grade) ? projection.grade : null;
  const weather = usesWeather(summary.methods) || summary.lastMethod === 'holtrop';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="relative flex min-w-0 items-center gap-4 overflow-hidden rounded-xl border bg-surface p-5 shadow-xs">
          <GradeChip grade={grade} size="xl" />
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              {t('summary.grade', { year: summary.year })}
              <MethodInfo methodId="cii.rating_grade" />
            </p>
            <p className="text-xl font-semibold">
              {grade ? CII_GRADE_LABELS[grade][locale] : t('grade.none')}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <SourceBadge source={summary.source} />
              {summary.asOf && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {t('summary.asOf', { time: format.dateTime(summary.asOf) })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
          <StatCard
            label={t('summary.attained')}
            value={format.cii(summary.attained)}
            unit={<CiiUnit />}
            icon={Gauge}
            tone="primary"
            methodId="cii.attained_accumulation"
            description={t('summary.attainedDescription')}
          />
          <StatCard
            label={t('summary.required')}
            value={format.cii(summary.required)}
            unit={<CiiUnit />}
            icon={Target}
            methodId="cii.required"
            description={
              summary.zPercent === null
                ? t('summary.zMissing')
                : t('summary.zOfYear', {
                    year: summary.year,
                    z: format.z(summary.zPercent),
                  })
            }
          />
          <StatCard
            label={t('summary.rating')}
            value={format.rating(summary.rating)}
            icon={TrendingUp}
            tone={grade === 'D' || grade === 'E' ? 'warning' : 'success'}
            methodId="cii.rating_grade"
            description={t('summary.ratingDescription')}
          />
        </div>
      </div>

      {summary.ddVector && (
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              {t('summary.scaleTitle')} <MethodInfo methodId="cii.dd_vector_boundaries" />
            </span>
          }
          description={t('summary.scaleDescription')}
        >
          <RatingScale
            dd={summary.ddVector}
            ariaLabel={t('summary.scaleAria', {
              attained: format.cii(summary.attained),
              grade: grade ?? '—',
              d1: format.cii(summary.ddVector.d1),
              d2: format.cii(summary.ddVector.d2),
              d3: format.cii(summary.ddVector.d3),
              d4: format.cii(summary.ddVector.d4),
            })}
            markers={[
              {
                value: summary.attained,
                label: `${t('summary.attainedShort')} ${format.cii(summary.attained)}`,
              },
              ...(summary.required
                ? [
                    {
                      value: summary.required,
                      label: `${t('summary.requiredShort')} ${format.cii(summary.required)}`,
                      tone: 'muted' as const,
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              {t('totals.title')} <MethodInfo methodId="emission.co2_conversion" />
            </span>
          }
          description={t('totals.description', { year: summary.year })}
        >
          <div className="flex flex-col gap-4">
            <KeyValueList
              columns={2}
              items={[
                {
                  key: 'distance',
                  label: t('totals.distance'),
                  value: <UnitValue value={summary.distanceNm} unit="nm" digits={1} />,
                },
                {
                  key: 'co2',
                  label: t('totals.co2'),
                  value: <UnitValue value={summary.co2Ton} unit="tonnes" />,
                },
                {
                  key: 'me',
                  label: t('totals.fuelMe'),
                  value: <UnitValue value={summary.fuelMeTon} unit="tonnes" />,
                },
                {
                  key: 'ae',
                  label: t('totals.fuelAe'),
                  value: <UnitValue value={summary.fuelAeTon} unit="tonnes" />,
                },
                {
                  key: 'segments',
                  label: t('totals.segments'),
                  value:
                    summary.segments === null
                      ? t('totals.manualNoSegments')
                      : format.number(summary.segments),
                  mono: summary.segments !== null,
                },
                {
                  key: 'capacity',
                  label: t('totals.capacity'),
                  value: format.number(summary.capacity),
                  mono: true,
                  hint: <MethodInfo methodId="cii.reference_line" />,
                },
              ]}
            />
            <div className="space-y-2 border-t pt-3">
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <Fuel className="size-3.5" aria-hidden /> {t('totals.methodMix')}
                <MethodInfo methodId="fuel.method_selection" />
                {summary.lastMethod && (
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    {t('totals.lastMethod')} <FuelMethodBadge method={summary.lastMethod} />
                  </span>
                )}
              </p>
              <MethodMix summary={summary} />
            </div>
          </div>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1">
              {t('projection.title')} <MethodInfo methodId="cii.year_end_projection" />
            </span>
          }
          description={t('projection.description')}
        >
          {projection ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('projection.elapsed')}</span>
                  <span className="font-mono tabular-nums">
                    {format.percent(projection.yearFraction * 100, 1)}
                  </span>
                </div>
                <Progress
                  value={projection.yearFraction * 100}
                  aria-label={t('projection.elapsed')}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <GradeChip grade={projectedGrade} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {t('projection.grade', {
                      grade: projectedGrade ?? '—',
                      rating: format.rating(projection.rating),
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('projection.sameAsYtd')}</p>
                </div>
              </div>
              <KeyValueList
                columns={2}
                dense
                items={[
                  {
                    key: 'distance',
                    label: t('projection.distance'),
                    value: <UnitValue value={projection.distanceNm} unit="nm" digits={0} />,
                  },
                  {
                    key: 'co2',
                    label: t('projection.co2'),
                    value: <UnitValue value={projection.co2Ton} unit="tonnes" digits={1} />,
                  },
                  {
                    key: 'me',
                    label: t('projection.fuelMe'),
                    value: <UnitValue value={projection.fuelMeTon} unit="tonnes" digits={1} />,
                  },
                  {
                    key: 'ae',
                    label: t('projection.fuelAe'),
                    value: <UnitValue value={projection.fuelAeTon} unit="tonnes" digits={1} />,
                  },
                ]}
              />
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Route className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('projection.none')}
            </div>
          )}
        </Section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MethodChips methodIds={summary.methodIds} />
        {weather && <DataAttribution />}
      </div>
    </div>
  );
}
