import { Leaf, Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import type { ReductionFactorDto } from '@/shared/api/generated/emission/model';
import { Can } from '@/shared/auth';
import { EmptyState } from '@/shared/domain-ui/feedback';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Section } from '@/shared/domain-ui/section';
import { Formula } from '@/shared/methodology';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { useReductionFactors } from '../api/queries';
import { CiiProblemState, CiiSubnav } from '../components/bits';
import { ReductionFactorsEditor } from '../components/reduction-factors-editor';
import { useCiiFormat } from '../hooks/use-cii-format';
import { currentYear } from '../lib/years';

const REQUIRED_LATEX = 'CII_{req}(y)=\\Big(1-\\frac{Z(y)}{100}\\Big)\\,a\\,\\mathrm{Cap}^{-c}';

function FactorTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const row = payload?.[0]?.payload as ReductionFactorDto | undefined;
  if (!active || !row) return null;
  return (
    <div className="max-w-72 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="font-semibold">{row.year}</p>
      <p className="mt-1 flex justify-between gap-4 text-muted-foreground">
        Z <span className="font-mono text-foreground tabular-nums">{format.z(row.zPercent)}</span>
      </p>
      <p className="mt-1 text-muted-foreground">{row.source}</p>
      <p className="sr-only">{t('factors.title')}</p>
    </div>
  );
}

/** Reduction factors Z per year (MEPC.338(76), MEPC.400(83)) with their sources; editable by platform admins. */
export function ReductionFactorsPage() {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const id = useId();
  const query = useReductionFactors();
  const [editing, setEditing] = useState(false);
  const thisYear = currentYear();
  const factors = [...(query.data?.data ?? [])].sort((a, b) => a.year - b.year);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('cii.title')}
        icon={Leaf}
        title={t('factors.title')}
        description={t('factors.description')}
        actions={
          <Can permission="reference:write">
            <Button size="sm" onClick={() => setEditing(true)} disabled={!query.data}>
              <Pencil /> {t('factors.edit')}
            </Button>
          </Can>
        }
      >
        <CiiSubnav />
      </PageHeader>

      {query.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border bg-surface">
          <CiiProblemState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : factors.length === 0 ? (
        <div className="rounded-xl border bg-surface">
          <EmptyState title={t('factors.emptyTitle')} description={t('factors.emptyDescription')} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section
              title={
                <span className="inline-flex items-center gap-1">
                  {t('factors.chartTitle')} <MethodInfo methodId="cii.reduction_factor_z" />
                </span>
              }
              description={t('factors.chartDescription')}
              className="min-w-0"
            >
              <figure className="h-64 min-w-0" aria-labelledby={`${id}-caption`}>
                <figcaption id={`${id}-caption`} className="sr-only">
                  {factors
                    .map((factor) => `${factor.year}: ${format.z(factor.zPercent)}`)
                    .join(', ')}
                </figcaption>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={factors}
                    margin={{ top: 22, right: 8, bottom: 0, left: 0 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="year"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      unit="%"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                      content={(props) => (
                        <FactorTooltip {...(props as TooltipContentProps<number, string>)} />
                      )}
                    />
                    <Bar dataKey="zPercent" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {factors.map((factor) => (
                        <Cell
                          key={factor.year}
                          fill={
                            factor.year === thisYear
                              ? 'var(--chart-1)'
                              : factor.year < thisYear
                                ? 'var(--chart-6)'
                                : 'var(--muted-foreground)'
                          }
                          fillOpacity={factor.year > thisYear ? 0.55 : 1}
                        />
                      ))}
                      <LabelList
                        dataKey="zPercent"
                        position="top"
                        formatter={(value: unknown) => format.number(Number(value), 2)}
                        className="fill-foreground font-mono text-[11px]"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </figure>
              <ul
                className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                aria-label={t('daily.legend')}
              >
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-chart-6" aria-hidden />{' '}
                  {t('factors.past')}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />{' '}
                  {t('factors.current', { year: thisYear })}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-muted-foreground/55" aria-hidden />{' '}
                  {t('factors.future')}
                </li>
              </ul>
            </Section>
            <Section
              title={
                <span className="inline-flex items-center gap-1">
                  {t('factors.howTitle')} <MethodInfo methodId="cii.required" />
                </span>
              }
              description={t('factors.howDescription')}
              className="min-w-0"
            >
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border bg-muted/30 px-4 py-2">
                  <Formula latex={REQUIRED_LATEX} />
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>{t('factors.howZ')}</li>
                  <li>{t('factors.howRef')}</li>
                  <li>{t('factors.howRepublish')}</li>
                </ul>
              </div>
            </Section>
          </div>

          <Section title={t('factors.tableTitle')} className="min-w-0" contentClassName="min-w-0">
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label={t('factors.tableTitle')}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('columns.year')}</TableHead>
                    <TableHead className="text-right">Z</TableHead>
                    <TableHead className="text-right">{t('factors.multiplier')}</TableHead>
                    <TableHead>{t('factors.source')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...factors].reverse().map((factor) => (
                    <TableRow
                      key={factor.year}
                      data-state={factor.year === thisYear ? 'selected' : undefined}
                    >
                      <TableCell className="font-mono font-semibold tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          {factor.year}
                          {factor.year === thisYear && (
                            <Badge variant="primary">{t('factors.thisYear')}</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.z(factor.zPercent)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {format.fixed(1 - factor.zPercent / 100, 5)}
                      </TableCell>
                      <TableCell className="max-w-md text-sm whitespace-normal text-muted-foreground">
                        {factor.source}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
          <Can permission="reference:write">
            <ReductionFactorsEditor factors={factors} open={editing} onOpenChange={setEditing} />
          </Can>
        </>
      )}
    </div>
  );
}
