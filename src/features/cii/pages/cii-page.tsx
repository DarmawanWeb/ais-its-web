import { CII_GRADE_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { AlertTriangle, CheckCircle2, Gauge, Leaf, Scale, Ship } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { useOrganizationsControllerList } from '@/shared/api/generated/auth/organizations/organizations';
import { useSession } from '@/shared/auth';
import { usePageState } from '@/shared/domain-ui/data-table';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';

import { useFleetSummary, useLiveCii, useReductionFactors } from '../api/queries';
import { CiiProblemState, CiiSubnav, LiveUpdateBadge, YearSelect } from '../components/bits';
import { FleetTable } from '../components/fleet-table';
import { GradeChip } from '../components/grade';
import { GradeDistribution } from '../components/grade-distribution';
import { useCiiFormat } from '../hooks/use-cii-format';
import { needsPreviousYearPage, toFleetRows } from '../lib/fleet-rows';
import { CII_GRADES, needsAction } from '../lib/grades';
import { currentYear, parseYear, yearOptions } from '../lib/years';

const ALL_ORGS = 'all';

/** Organization filter of platform administrators (others always see their active org). */
function OrgFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('cii');
  const { orgId } = useSession();
  const orgs = useOrganizationsControllerList({ pageSize: 100 }, { query: { staleTime: 60_000 } });
  const options = orgs.data?.data ?? [];
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="cii-org" className="text-xs whitespace-nowrap text-muted-foreground">
        {t('fleet.organization')}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="cii-org" size="sm" className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ORGS}>{t('fleet.allOrganizations')}</SelectItem>
          {options.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
              {org.id === orgId ? ` · ${t('fleet.activeOrganization')}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RegulationCard({ year, needAction }: { year: number; needAction: number }) {
  const { t, i18n } = useTranslation('cii');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const format = useCiiFormat();
  const factors = useReductionFactors();
  const factor = factors.data?.data.find((item) => item.year === year);
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          {t('fleet.regulationTitle', { year })} <MethodInfo methodId="cii.reduction_factor_z" />
        </span>
      }
      description={t('fleet.regulationDescription')}
      className="min-w-0"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t('fleet.reductionFactor', { year })}
            </p>
            {factors.isPending ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {factor ? format.z(factor.zPercent) : '—'}
              </p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {factor?.source ?? (factors.isPending ? '' : t('fleet.reductionFactorMissing'))}
            </p>
          </div>
          <Link
            to="/cii/reduction-factors"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            {t('fleet.reductionFactorsLink')}
          </Link>
        </div>
        <ul className="grid gap-1.5" aria-label={t('fleet.gradeMeaning')}>
          {CII_GRADES.map((grade) => (
            <li key={grade} className="flex items-center gap-2.5 text-sm">
              <GradeChip grade={grade} size="sm" />
              <span className="min-w-0">
                <span className="font-medium">{CII_GRADE_LABELS[grade][locale]}</span>{' '}
                <span className="text-xs text-muted-foreground">{t(`gradeMeaning.${grade}`)}</span>
              </span>
            </li>
          ))}
        </ul>
        {needAction > 0 ? (
          <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{t('fleet.actionPlan', { count: needAction })}</span>
          </p>
        ) : (
          <p className="flex gap-2 rounded-lg border border-success/40 bg-success/8 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>{t('fleet.noActionPlan')}</span>
          </p>
        )}
      </div>
    </Section>
  );
}

/** Emissions & CII: fleet grade distribution and the CII of every vessel of the organization. */
export function CiiPage() {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const { isPlatformAdmin } = useSession();
  const [params, setParams] = useSearchParams();
  const thisYear = currentYear();
  const year = parseYear(params.get('year'), thisYear, 2000, thisYear);
  const org = isPlatformAdmin ? (params.get('org') ?? ALL_ORGS) : ALL_ORGS;
  const paging = usePageState({ pageSize: 20 });
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  useLiveCii(undefined, setLiveAt);

  const orgId = isPlatformAdmin && org !== ALL_ORGS ? org : undefined;
  const summary = useFleetSummary({
    year,
    page: paging.page,
    pageSize: paging.pageSize,
    ...(orgId ? { orgId } : {}),
  });
  // Older emission versions carry no `previousYear`: join the same page of year − 1 then.
  const previous = useFleetSummary(
    { year: year - 1, page: paging.page, pageSize: paging.pageSize, ...(orgId ? { orgId } : {}) },
    summary.isSuccess && needsPreviousYearPage(summary.data.items),
  );
  const data = summary.data;
  const rows = data ? toFleetRows(data.items, previous.data?.items) : undefined;
  const rated = data ? data.vessels - data.notAvailable : 0;
  const goodShare =
    data && rated > 0 ? ((data.grades.A + data.grades.B + data.grades.C) / rated) * 100 : null;
  const actionCount = needsAction(data?.grades);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    paging.setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.fleet')}
        icon={Leaf}
        title={t('cii.title')}
        description={t('cii.description')}
        actions={
          <>
            <LiveUpdateBadge at={liveAt} />
            {isPlatformAdmin && (
              <OrgFilter
                value={org}
                onChange={(value) => update('org', value === ALL_ORGS ? null : value)}
              />
            )}
            <YearSelect
              value={year}
              years={yearOptions()}
              onChange={(value) => update('year', value === thisYear ? null : String(value))}
              label={t('fleet.year')}
            />
          </>
        }
      >
        <CiiSubnav />
      </PageHeader>

      {summary.isError && !data ? (
        <div className="rounded-xl border bg-surface">
          <CiiProblemState error={summary.error} onRetry={() => void summary.refetch()} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
            <StatCard
              label={t('kpi.vessels')}
              value={data ? format.number(data.vessels) : '—'}
              description={t('kpi.vesselsDescription')}
              icon={Ship}
              tone="primary"
              loading={summary.isPending}
            />
            <StatCard
              label={t('kpi.rated')}
              value={data ? format.number(rated) : '—'}
              unit={data ? t('kpi.ofVessels', { count: data.vessels }) : undefined}
              description={t('kpi.ratedDescription', { year })}
              icon={Gauge}
              methodId="cii.attained_accumulation"
              loading={summary.isPending}
            />
            <StatCard
              label={t('kpi.goodShare')}
              value={goodShare === null ? '—' : format.fixed(goodShare, 0)}
              unit={goodShare === null ? undefined : '%'}
              description={t('kpi.goodShareDescription')}
              icon={Scale}
              tone="success"
              methodId="cii.rating_grade"
              loading={summary.isPending}
            />
            <StatCard
              label={t('kpi.needAction')}
              value={data ? format.number(actionCount) : '—'}
              description={t('kpi.needActionDescription')}
              icon={AlertTriangle}
              tone={actionCount > 0 ? 'warning' : 'default'}
              methodId="cii.rating_grade"
              loading={summary.isPending}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section
              title={
                <span className="inline-flex items-center gap-1">
                  {t('fleet.distributionTitle', { year })}
                  <MethodInfo methodId="cii.rating_grade" />
                  <MethodInfo methodId="cii.dd_vector_boundaries" />
                </span>
              }
              description={t('fleet.distributionDescription')}
              className="min-w-0"
            >
              {summary.isPending || !data ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <GradeDistribution grades={data.grades} notAvailable={data.notAvailable} />
              )}
            </Section>
            <RegulationCard year={year} needAction={actionCount} />
          </div>

          <Section
            title={t('fleet.tableTitle', { year })}
            description={t('fleet.tableDescription')}
            className="min-w-0"
            contentClassName="min-w-0"
          >
            <FleetTable
              rows={rows}
              loading={summary.isPending}
              error={summary.isError ? summary.error : undefined}
              onRetry={() => void summary.refetch()}
              pagination={data ? paging.adapter(data.meta) : undefined}
              year={year}
            />
            <DataAttribution className="mt-3" />
          </Section>
        </>
      )}
    </div>
  );
}
