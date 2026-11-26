import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FolderOpen,
  ListChecks,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import type { FleetVesselCiiDto } from '@/shared/api/generated/emission/model';
import { DataTable, usePageState } from '@/shared/domain-ui/data-table';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { StatCard } from '@/shared/domain-ui/stat-card';
import { MmsiText } from '@/shared/domain-ui/values';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { SimpleTooltip } from '@/shared/ui/tooltip';

import { useFleetVessels, useMeasures, useScenarios } from '../api/queries';
import { GradeChip, SeempProblemState } from '../components/bits';
import { MeasuresCatalog } from '../components/measures-catalog';
import { ScenariosTable } from '../components/scenarios';
import { useSeempFormat } from '../hooks/use-seemp-format';
import { correctiveCount, isGrade, type SeempPriority, seempPriority } from '../lib/grade-style';

const PRIORITY_VARIANT: Record<SeempPriority, 'warning' | 'info' | 'success' | 'muted'> = {
  corrective: 'warning',
  monitor: 'info',
  compliant: 'success',
  noData: 'muted',
};

function PriorityBadge({ grade }: { grade: unknown }) {
  const { t } = useTranslation('seemp');
  const priority = seempPriority(grade);
  return (
    <SimpleTooltip label={t(`priority.${priority}Hint`)}>
      <Badge variant={PRIORITY_VARIANT[priority]} className="cursor-help" tabIndex={0}>
        {priority === 'corrective' && <AlertTriangle aria-hidden />}
        {t(`priority.${priority}`)}
      </Badge>
    </SimpleTooltip>
  );
}

/** Planning figures of the organization: who needs a plan, what can be planned, what was saved. */
function SeempKpis() {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const fleet = useFleetVessels({ page: 1, pageSize: 1 });
  const measures = useMeasures();
  const scenarios = useScenarios({ page: 1, pageSize: 1 });
  const year = fleet.data?.year ?? new Date().getUTCFullYear();
  const needAction = correctiveCount(fleet.data?.grades);
  const rated = fleet.data ? fleet.data.vessels - fleet.data.notAvailable : null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
      {fleet.allowed && (
        <StatCard
          label={t('kpi.needAction')}
          value={fleet.data ? format.number(needAction) : '—'}
          description={t('kpi.needActionDescription', { year })}
          icon={AlertTriangle}
          tone={needAction > 0 ? 'warning' : 'success'}
          methodId="cii.rating_grade"
          loading={fleet.isPending}
        />
      )}
      {fleet.allowed && (
        <StatCard
          label={t('kpi.rated')}
          value={rated === null ? '—' : format.number(rated)}
          unit={fleet.data ? `/ ${format.number(fleet.data.vessels)}` : undefined}
          description={t('kpi.ratedDescription', { year })}
          icon={ClipboardCheck}
          tone="primary"
          methodId="cii.attained_accumulation"
          loading={fleet.isPending}
        />
      )}
      <StatCard
        label={t('kpi.measures')}
        value={measures.data ? format.number(measures.data.data.length) : '—'}
        description={t('kpi.measuresDescription')}
        icon={ListChecks}
        methodId="seemp.filter_sort_output"
        loading={measures.isPending}
      />
      <StatCard
        label={t('kpi.scenarios')}
        value={scenarios.data ? format.number(scenarios.data.meta.total) : '—'}
        description={t('kpi.scenariosDescription')}
        icon={FolderOpen}
        loading={scenarios.isPending}
      />
    </div>
  );
}

const TABS = ['vessels', 'measures', 'scenarios'] as const;
type Tab = (typeof TABS)[number];

function OpenByMmsi() {
  const { t } = useTranslation('seemp');
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const valid = /^\d{9}$/.test(value.trim());
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void navigate(`/seemp/vessels/${value.trim()}`);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="seemp-mmsi">{t('vessels.openByMmsi')}</Label>
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="seemp-mmsi"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="numeric"
            placeholder="525005223"
            className="w-48 pl-9 font-mono"
          />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={!valid}>
        {t('vessels.open')} <ArrowRight />
      </Button>
    </form>
  );
}

function VesselsTab() {
  const { t } = useTranslation('seemp');
  const format = useSeempFormat();
  const navigate = useNavigate();
  const paging = usePageState({ pageSize: 10 });
  const fleet = useFleetVessels({ page: paging.page, pageSize: paging.pageSize });
  const columns = useMemo<ColumnDef<FleetVesselCiiDto>[]>(
    () => [
      {
        id: 'vessel',
        header: t('vessels.vessel'),
        cell: ({ row }) => (
          <span className="flex min-w-40 flex-col">
            <span className="font-medium">{row.original.name}</span>
            <MmsiText mmsi={row.original.mmsi} className="text-xs text-muted-foreground" />
          </span>
        ),
      },
      {
        id: 'grade',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('vessels.grade')} <MethodInfo methodId="cii.rating_grade" />
          </span>
        ),
        cell: ({ row }) => (
          <GradeChip grade={isGrade(row.original.grade) ? row.original.grade : null} showLabel />
        ),
      },
      {
        id: 'rating',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('vessels.rating')} <MethodInfo methodId="cii.rating_grade" />
          </span>
        ),
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.rating(row.original.rating)}</span>
        ),
      },
      {
        id: 'attained',
        header: () => (
          <span className="inline-flex items-center gap-1">
            {t('vessels.attained')} <MethodInfo methodId="cii.attained_accumulation" />
          </span>
        ),
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{format.cii(row.original.attained)}</span>
        ),
      },
      {
        id: 'priority',
        header: t('vessels.priority'),
        cell: ({ row }) => <PriorityBadge grade={row.original.grade} />,
      },
      {
        id: 'action',
        header: () => <span className="sr-only">{t('vessels.action')}</span>,
        meta: { className: 'text-right' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t('vessels.recommendations')} <ArrowRight className="size-3.5" aria-hidden />
            <span className="sr-only">{row.original.name}</span>
          </span>
        ),
      },
    ],
    [t, format],
  );

  return (
    <Section
      title={t('vessels.title', { year: fleet.data?.year ?? new Date().getUTCFullYear() })}
      description={t('vessels.description')}
      actions={<OpenByMmsi />}
      className="min-w-0"
      contentClassName="min-w-0"
    >
      {fleet.allowed ? (
        <DataTable
          columns={columns}
          data={fleet.data?.items}
          loading={fleet.isPending}
          error={fleet.isError ? fleet.error : undefined}
          onRetry={() => void fleet.refetch()}
          getRowId={(row) => String(row.mmsi)}
          onRowClick={(row) => void navigate(`/seemp/vessels/${row.mmsi}`)}
          pagination={fleet.data ? paging.adapter(fleet.data.meta) : undefined}
          ariaLabel={t('vessels.tableLabel')}
          emptyState={
            <EmptyState
              size="sm"
              title={t('vessels.emptyTitle')}
              description={t('vessels.emptyDescription')}
            />
          }
        />
      ) : (
        <EmptyState
          size="sm"
          title={t('vessels.noFleetTitle')}
          description={t('vessels.noFleetDescription')}
        />
      )}
    </Section>
  );
}

function MeasuresTab() {
  const { t } = useTranslation('seemp');
  const measures = useMeasures();
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          {t('catalog.title')} <MethodInfo methodId="seemp.filter_sort_output" />
        </span>
      }
      description={t('catalog.description')}
    >
      {measures.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : measures.isError ? (
        <SeempProblemState error={measures.error} onRetry={() => void measures.refetch()} />
      ) : measures.data.data.length === 0 ? (
        <EmptyState title={t('catalog.emptyTitle')} description={t('catalog.emptyDescription')} />
      ) : (
        <MeasuresCatalog measures={measures.data.data} />
      )}
    </Section>
  );
}

function ScenariosTab() {
  const { t } = useTranslation('seemp');
  const measures = useMeasures();
  return (
    <Section
      title={t('scenarios.title')}
      description={t('scenarios.description')}
      className="min-w-0"
      contentClassName="min-w-0"
    >
      <ScenariosTable measures={measures.data?.data ?? []} showVessel />
    </Section>
  );
}

/** SEEMP: vessels to plan for, the catalog of the 12 energy-efficiency measures, saved scenarios. */
export function SeempPage() {
  const { t } = useTranslation('seemp');
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'vessels';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.fleet')}
        icon={ClipboardCheck}
        title={t('seemp.title')}
        description={t('seemp.description')}
      />
      <SeempKpis />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === 'vessels') next.delete('tab');
          else next.set('tab', value);
          setParams(next, { replace: true });
        }}
      >
        <div className="max-w-full overflow-x-auto">
          <TabsList aria-label={t('seemp.tabs')}>
            {TABS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {t(`seemp.tab.${item}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="vessels" className="mt-4">
          <VesselsTab />
        </TabsContent>
        <TabsContent value="measures" className="mt-4">
          <MeasuresTab />
        </TabsContent>
        <TabsContent value="scenarios" className="mt-4">
          <ScenariosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
