import { ArrowLeft, ClipboardCheck, FilePenLine, Leaf, RotateCcw, Ship } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';

import { Can, useSession } from '@/shared/auth';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { MmsiText } from '@/shared/domain-ui/values';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  useLiveCii,
  useVesselAnnual,
  useVesselCurrent,
  useVesselDaily,
  useVesselIdentity,
} from '../api/queries';
import { AnnualHistory } from '../components/annual-history';
import { CiiProblemState, LiveUpdateBadge, YearSelect } from '../components/bits';
import { CurrentSummary } from '../components/current-summary';
import { DailyChart } from '../components/daily-chart';
import { DcsReport } from '../components/dcs-report';
import { ManualRecordDialog } from '../components/manual-record-dialog';
import { RecomputeDialog, RecomputeJobCard } from '../components/recompute';
import { SegmentsPanel } from '../components/segments-panel';
import { isCiiNotAvailable } from '../lib/problems';
import { CII_FIRST_YEAR, currentYear, parseYear, yearOptions } from '../lib/years';

const TABS = ['summary', 'history', 'segments', 'dcs'] as const;
type Tab = (typeof TABS)[number];

function SummaryTab({
  mmsi,
  year,
  onAddManual,
}: {
  mmsi: number;
  year: number;
  onAddManual: (year: number) => void;
}) {
  const { t } = useTranslation('cii');
  const current = useVesselCurrent(mmsi, year);
  const daily = useVesselDaily(mmsi, year);

  if (current.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }
  if (current.isError) {
    return (
      <div className="rounded-xl border bg-surface">
        <CiiProblemState
          error={current.error}
          onRetry={() => void current.refetch()}
          values={{ year }}
          action={
            isCiiNotAvailable(current.error) ? (
              <Can permission="vessel:write">
                <Button size="sm" onClick={() => onAddManual(year)}>
                  <FilePenLine /> {t('vessel.addManual', { year })}
                </Button>
              </Can>
            ) : undefined
          }
        />
      </div>
    );
  }
  const summary = current.data;
  return (
    <div className="flex flex-col gap-4">
      <CurrentSummary summary={summary} />
      <Section
        title={
          <span className="inline-flex items-center gap-1">
            {t('daily.title', { year })} <MethodInfo methodId="cii.attained_accumulation" />
            <MethodInfo methodId="cii.dd_vector_boundaries" />
          </span>
        }
        description={t('daily.description')}
        className="min-w-0"
        contentClassName="min-w-0"
      >
        {daily.isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : daily.isError ? (
          <CiiProblemState
            error={daily.error}
            onRetry={() => void daily.refetch()}
            size="sm"
            values={{ year }}
          />
        ) : daily.data.points.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('daily.emptyTitle')}
            description={t('daily.emptyDescription')}
          />
        ) : (
          <DailyChart points={daily.data.points} dd={summary.ddVector} year={year} />
        )}
      </Section>
    </div>
  );
}

function HistoryTab({
  mmsi,
  onEditManual,
}: {
  mmsi: number;
  onEditManual: (year: number | null) => void;
}) {
  const { t } = useTranslation('cii');
  const annual = useVesselAnnual(mmsi);
  if (annual.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (annual.isError) {
    return (
      <div className="rounded-xl border bg-surface">
        <CiiProblemState
          error={annual.error}
          onRetry={() => void annual.refetch()}
          values={{ year: currentYear() }}
          action={
            isCiiNotAvailable(annual.error) ? (
              <Can permission="vessel:write">
                <Button size="sm" onClick={() => onEditManual(null)}>
                  <FilePenLine /> {t('annual.addManual')}
                </Button>
              </Can>
            ) : undefined
          }
        />
      </div>
    );
  }
  return <AnnualHistory annual={annual.data} onEditManual={onEditManual} />;
}

/** CII of one vessel: year-to-date figures, daily curve, history, segments and DCS report. */
export function CiiVesselPage() {
  const { t } = useTranslation('cii');
  const { mmsi: param } = useParams();
  const mmsi = /^\d{9}$/.test(param ?? '') ? Number(param) : 0;
  const [params, setParams] = useSearchParams();
  const thisYear = currentYear();
  const year = parseYear(params.get('year'), thisYear, 2000, thisYear);
  const tabParam = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'summary';
  const { isPlatformAdmin } = useSession();
  const identity = useVesselIdentity(mmsi);
  const annual = useVesselAnnual(mmsi);
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [manual, setManual] = useState<{ open: boolean; year: number }>({ open: false, year });
  useLiveCii(mmsi || undefined, setLiveAt);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
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
            <Link to="/cii">
              <ArrowLeft /> {t('vessel.back')}
            </Link>
          </Button>
        }
      />
    );
  }

  const vessel = identity.vessel;
  const title = vessel?.name ?? t('vessel.fallbackTitle', { mmsi });
  const manualYears = Array.from({ length: thisYear - 2018 }, (_, index) => thisYear - index);
  const segmentYears = (annual.data?.years ?? [])
    .filter((item) => item.source === 'segments')
    .map((item) => item.year);
  const openManual = (forYear: number | null) =>
    setManual({ open: true, year: forYear ?? Math.max(CII_FIRST_YEAR, thisYear - 1) });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={year === thisYear ? '/cii' : `/cii?year=${year}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t('vessel.back')}
        </Link>
      </div>
      <PageHeader
        eyebrow={t('cii.title')}
        icon={Leaf}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              MMSI <MmsiText mmsi={mmsi} copyable />
            </span>
            {vessel?.imo && <span className="font-mono text-xs">IMO {vessel.imo}</span>}
            {vessel?.type && <span>{vessel.type.name}</span>}
            {vessel?.flag && <span className="font-mono text-xs">{vessel.flag}</span>}
          </span>
        }
        actions={
          <>
            <LiveUpdateBadge at={liveAt} />
            <YearSelect
              value={year}
              years={yearOptions()}
              onChange={(value) => setParam('year', value === thisYear ? null : String(value))}
              label={t('fleet.year')}
            />
            <Can permission="seemp:read">
              <Button asChild size="sm" variant="outline">
                <Link to={`/seemp/vessels/${mmsi}`}>
                  <ClipboardCheck /> {t('vessel.seemp')}
                </Link>
              </Button>
            </Can>
            {isPlatformAdmin && (
              <Button size="sm" variant="outline" onClick={() => setRecomputeOpen(true)}>
                <RotateCcw /> {t('recompute.open')}
              </Button>
            )}
          </>
        }
      />

      {jobId && <RecomputeJobCard jobId={jobId} mmsi={mmsi} onDismiss={() => setJobId(null)} />}

      <Tabs
        value={tab}
        onValueChange={(value) => setParam('tab', value === 'summary' ? null : value)}
      >
        <div className="max-w-full overflow-x-auto">
          <TabsList aria-label={t('vessel.tabs')}>
            {TABS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {t(`vessel.tab.${item}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="summary" className="mt-4">
          <SummaryTab mmsi={mmsi} year={year} onAddManual={openManual} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab mmsi={mmsi} onEditManual={openManual} />
        </TabsContent>
        <TabsContent value="segments" className="mt-4">
          <SegmentsPanel mmsi={mmsi} />
        </TabsContent>
        <TabsContent value="dcs" className="mt-4">
          <DcsReport mmsi={mmsi} year={year} />
        </TabsContent>
      </Tabs>

      <Can permission="vessel:write">
        <ManualRecordDialog
          mmsi={mmsi}
          open={manual.open}
          onOpenChange={(open) => setManual((state) => ({ ...state, open }))}
          initialYear={manual.year}
          years={manualYears}
          segmentYears={segmentYears}
        />
      </Can>
      {isPlatformAdmin && (
        <RecomputeDialog
          mmsi={mmsi}
          open={recomputeOpen}
          onOpenChange={setRecomputeOpen}
          onStarted={(job) => setJobId(job.id)}
        />
      )}
    </div>
  );
}
