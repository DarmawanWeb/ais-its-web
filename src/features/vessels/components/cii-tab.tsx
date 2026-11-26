import { CII_GRADES, type CiiGrade } from '@darmawanweb/ais-its-contracts/domain';
import { ArrowUpRight, Leaf } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  useCiiControllerCurrent,
  useCiiControllerDaily,
} from '@/shared/api/generated/emission/cii/cii';
import type { CiiSummaryDto, DdVectorDto } from '@/shared/api/generated/emission/model';
import { isApiProblem } from '@/shared/api/problem';
import { CiiGradeBadge } from '@/shared/domain-ui/badges';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { KeyValueList } from '@/shared/domain-ui/key-value-list';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { UnitValue } from '@/shared/domain-ui/values';
import { formatDateTime, formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { currentYear } from '@/shared/lib/clock';

const GRADE_BG: Record<CiiGrade, string> = {
  A: 'bg-grade-a',
  B: 'bg-grade-b',
  C: 'bg-grade-c',
  D: 'bg-grade-d',
  E: 'bg-grade-e',
};

/** Grade scale A–E from the absolute boundaries d_i × required with the attained marker. */
function GradeScale({ attained, dd }: { attained: number; dd: DdVectorDto }) {
  const { t, i18n } = useTranslation('vessels');
  const max = Math.max(dd.d4 * 1.25, attained * 1.05);
  const edges = [0, dd.d1, dd.d2, dd.d3, dd.d4, max];
  const left = Math.min(Math.max((attained / max) * 100, 0), 100);
  return (
    <div
      className="space-y-2"
      role="img"
      aria-label={t('cii.scaleLabel', { value: formatNumber(attained, i18n.language) })}
    >
      <div className="relative pt-6">
        <div
          className="absolute top-0 -translate-x-1/2 text-center"
          style={{ left: `${left}%` }}
          aria-hidden
        >
          <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-[11px] text-background">
            {formatNumber(attained, i18n.language, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
          {CII_GRADES.map((grade, index) => (
            <div
              key={grade}
              className={cn(GRADE_BG[grade], 'h-full')}
              style={{
                width: `${(((edges[index + 1] ?? max) - (edges[index] ?? 0)) / max) * 100}%`,
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-5 h-5 w-0.5 -translate-x-1/2 rounded bg-foreground"
          style={{ left: `${left}%` }}
          aria-hidden
        />
      </div>
      <div className="flex text-[11px] text-muted-foreground" aria-hidden>
        {CII_GRADES.map((grade, index) => (
          <span
            key={grade}
            className="text-center"
            style={{ width: `${(((edges[index + 1] ?? max) - (edges[index] ?? 0)) / max) * 100}%` }}
          >
            {grade}
          </span>
        ))}
      </div>
    </div>
  );
}

function CiiFigures({ summary }: { summary: CiiSummaryDto }) {
  const { t, i18n } = useTranslation('vessels');
  const n = (value: number | null | undefined, digits = 2) =>
    formatNumber(value ?? null, i18n.language, { maximumFractionDigits: digits });
  const methods = summary.methods;
  const segments = methods ? methods.telemetry + methods.firstFormula + methods.holtrop : 0;
  const share = (count: number) =>
    segments > 0
      ? formatNumber((count / segments) * 100, i18n.language, { maximumFractionDigits: 0 })
      : '0';
  return (
    <KeyValueList
      columns={2}
      items={[
        {
          key: 'attained',
          label: t('cii.attained'),
          hint: <MethodInfo methodId="cii.attained_accumulation" />,
          value: <span className="font-mono tabular-nums">{n(summary.attained, 3)}</span>,
        },
        {
          key: 'required',
          label: t('cii.required'),
          hint: <MethodInfo methodId="cii.required" />,
          value: <span className="font-mono tabular-nums">{n(summary.required, 3)}</span>,
        },
        {
          key: 'rating',
          label: t('cii.rating'),
          hint: <MethodInfo methodId="cii.rating_grade" />,
          value: <span className="font-mono tabular-nums">{n(summary.rating, 3)}</span>,
        },
        {
          key: 'z',
          label: t('cii.z'),
          hint: <MethodInfo methodId="cii.reduction_factor_z" />,
          value: <UnitValue value={summary.zPercent} unit="percent" />,
        },
        {
          key: 'distance',
          label: t('cii.distance'),
          value: <UnitValue value={summary.distanceNm} unit="nm" digits={0} />,
        },
        {
          key: 'co2',
          label: t('cii.co2'),
          hint: <MethodInfo methodId="emission.co2_conversion" />,
          value: <UnitValue value={summary.co2Ton} unit="tonnes" digits={1} />,
        },
        {
          key: 'me',
          label: t('cii.fuelMe'),
          value: <UnitValue value={summary.fuelMeTon} unit="tonnes" digits={1} />,
        },
        {
          key: 'ae',
          label: t('cii.fuelAe'),
          value: <UnitValue value={summary.fuelAeTon} unit="tonnes" digits={1} />,
        },
        {
          key: 'methods',
          label: t('cii.methods'),
          hint: <MethodInfo methodId="fuel.method_selection" />,
          value: methods
            ? t('cii.methodShares', {
                telemetry: share(methods.telemetry),
                formula: share(methods.firstFormula),
                holtrop: share(methods.holtrop),
              })
            : t('cii.manual'),
        },
        {
          key: 'asOf',
          label: t('cii.asOf'),
          value: summary.asOf ? formatDateTime(summary.asOf, i18n.language) : '—',
        },
      ]}
    />
  );
}

function DailyChart({ mmsi, required }: { mmsi: number; required: number | null }) {
  const { t, i18n } = useTranslation('vessels');
  const id = useId();
  const daily = useCiiControllerDaily(String(mmsi), undefined, {
    query: { retry: false, staleTime: 300_000 },
  });
  const points = (daily.data?.points ?? []).filter((point) => point.cumulativeAttained !== null);
  if (daily.isPending) return <Skeleton className="h-56 w-full" />;
  if (points.length < 2) return null;
  return (
    <figure aria-labelledby={`${id}-caption`} className="h-56 min-w-0">
      <figcaption id={`${id}-caption`} className="sr-only">
        {t('cii.dailyCaption')}
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickFormatter={(day: string) => formatDateTime(day, i18n.language, 'dd MMM')}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(day) =>
              typeof day === 'string' ? formatDateTime(day, i18n.language, 'dd MMM yyyy') : ''
            }
            formatter={(value) => [
              formatNumber(Number(value), i18n.language, { maximumFractionDigits: 3 }),
              t('cii.cumulative'),
            ]}
          />
          {required !== null && (
            <ReferenceLine
              y={required}
              stroke="var(--warning)"
              strokeDasharray="6 4"
              label={{
                value: t('cii.required'),
                fill: 'var(--muted-foreground)',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="cumulativeAttained"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** CII tab: year-to-date CII of the vessel (tenant-private, `cii:read`). */
export function CiiTab({ mmsi }: { mmsi: number }) {
  const { t, i18n } = useTranslation('vessels');
  const year = currentYear();
  const current = useCiiControllerCurrent(
    String(mmsi),
    { year },
    { query: { retry: false, staleTime: 120_000 } },
  );
  if (current.isPending) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (current.error) {
    if (isApiProblem(current.error) && current.error.code === 'CII_NOT_AVAILABLE') {
      return (
        <Section title={t('cii.title', { year })}>
          <EmptyState icon={Leaf} title={t('cii.empty')} description={t('cii.emptyHint')} />
        </Section>
      );
    }
    return <ErrorState error={current.error} onRetry={() => void current.refetch()} />;
  }
  const summary = current.data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Section
        title={t('cii.title', { year })}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/cii">
              {t('cii.report')} <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <CiiGradeBadge grade={summary.grade} size="lg" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                {t('cii.grade')} <MethodInfo methodId="cii.rating_grade" />
              </p>
              <p className="text-sm">
                {summary.source === 'manual'
                  ? t('cii.sourceManual')
                  : t('cii.sourceSegments', { count: summary.segments ?? 0 })}
              </p>
            </div>
          </div>
          {summary.ddVector && <GradeScale attained={summary.attained} dd={summary.ddVector} />}
          {summary.projection && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                {t('cii.projection')} <MethodInfo methodId="cii.year_end_projection" />
              </span>
              <span className="flex items-center gap-2 text-sm">
                <CiiGradeBadge grade={summary.projection.grade} size="sm" />
                <UnitValue value={summary.projection.co2Ton} unit="tonnes" digits={0} />
                <span className="text-xs text-muted-foreground">CO₂</span>
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t('cii.capacity', {
              capacity: formatNumber(summary.capacity, i18n.language, { maximumFractionDigits: 0 }),
            })}
          </p>
        </div>
      </Section>
      <Section title={t('cii.figures')} description={t('cii.figuresDescription')}>
        <div className="flex flex-col gap-6">
          <CiiFigures summary={summary} />
          <DailyChart mmsi={mmsi} required={summary.required} />
          <DataAttribution provider="open-meteo" />
        </div>
      </Section>
    </div>
  );
}
