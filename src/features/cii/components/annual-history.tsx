import { BarChart3, FilePenLine, Plus, Table2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

import type { AnnualCiiDto, CiiYearDto } from '@/shared/api/generated/emission/model';
import { Can } from '@/shared/auth';
import { DataAttribution } from '@/shared/domain-ui/data-attribution';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { CII_GRADE_COLORS } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { useCiiFormat } from '../hooks/use-cii-format';
import { type CiiGrade, isGrade } from '../lib/grades';
import { usesWeather } from '../lib/segments';
import { CiiUnit, MethodChips, SourceBadge } from './bits';
import { GradeChip } from './grade';

interface YearRow {
  label: string;
  year: number;
  attained: number;
  required: number | null;
  grade: CiiGrade | null;
  manual: boolean;
  item: CiiYearDto;
}

function AnnualTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const row = payload?.[0]?.payload as YearRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="min-w-52 rounded-lg border bg-elevated px-3 py-2 text-xs shadow-elevated">
      <p className="mb-1.5 flex items-center justify-between gap-3 font-semibold">
        {row.year}
        <GradeChip grade={row.grade} size="sm" />
      </p>
      <dl className="space-y-1">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('columns.attained')}</dt>
          <dd className="font-mono tabular-nums">{format.cii(row.attained)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('columns.required')}</dt>
          <dd className="font-mono tabular-nums">{format.cii(row.required)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('columns.rating')}</dt>
          <dd className="font-mono tabular-nums">{format.rating(row.item.rating)}</dd>
        </div>
      </dl>
      {row.manual && (
        <p className="mt-1.5 border-t pt-1.5 text-warning">{t('source.manualHint')}</p>
      )}
    </div>
  );
}

/**
 * Annual CII per calendar year: attained bars on the grade colours (manual / imported years
 * hatched and badged), required as a dashed marker line, and the full table with the source.
 */
export function AnnualHistory({
  annual,
  onEditManual,
}: {
  annual: AnnualCiiDto;
  onEditManual: (year: number | null) => void;
}) {
  const { t } = useTranslation('cii');
  const format = useCiiFormat();
  const id = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const years = [...annual.years].sort((a, b) => a.year - b.year);
  const rows: YearRow[] = years.map((item) => ({
    label: String(item.year),
    year: item.year,
    attained: item.attained,
    required: item.required,
    grade: isGrade(item.grade) ? item.grade : null,
    manual: item.source === 'manual',
    item,
  }));
  const manualCount = rows.filter((row) => row.manual).length;
  const weather = years.some((item) => usesWeather(item.methods));
  const methodIds = years.flatMap((item) => item.methodIds);

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1">
          {t('annual.title')} <MethodInfo methodId="cii.attained_accumulation" />
          <MethodInfo methodId="cii.annual_manual" />
        </span>
      }
      description={t('annual.description')}
      actions={
        <Can permission="vessel:write">
          <Button size="sm" variant="outline" onClick={() => onEditManual(null)}>
            <Plus /> {t('annual.addManual')}
          </Button>
        </Can>
      }
      className="min-w-0"
      contentClassName="min-w-0"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
            aria-label={t('daily.legend')}
          >
            <li className="flex items-center gap-1.5">
              <span className="flex gap-px" aria-hidden>
                {(['A', 'B', 'C', 'D', 'E'] as const).map((grade) => (
                  <span
                    key={grade}
                    className="size-2.5 rounded-sm"
                    style={{ background: CII_GRADE_COLORS[grade] }}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">{t('annual.attainedLegend')}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-foreground/70" aria-hidden />
              <span className="text-muted-foreground">{t('daily.required')}</span>
            </li>
            {manualCount > 0 && (
              <li className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm bg-muted-foreground"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, transparent 0 2px, var(--surface) 2px 3.5px)',
                  }}
                  aria-hidden
                />
                <span className="text-muted-foreground">{t('annual.manualLegend')}</span>
              </li>
            )}
          </ul>
          <div className="flex gap-1" role="group" aria-label={t('fleet.view')}>
            <Button
              variant={view === 'chart' ? 'subtle' : 'ghost'}
              size="xs"
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              <BarChart3 /> {t('fleet.chartView')}
            </Button>
            <Button
              variant={view === 'table' ? 'subtle' : 'ghost'}
              size="xs"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Table2 /> {t('fleet.tableView')}
            </Button>
          </div>
        </div>

        {view === 'chart' && (
          <figure className="h-64 min-w-0" aria-labelledby={`${id}-caption`}>
            <figcaption id={`${id}-caption`} className="sr-only">
              {rows
                .map(
                  (row) =>
                    `${row.year}: ${format.cii(row.attained)} (${row.grade ?? '—'}${row.manual ? `, ${t('source.manual')}` : ''})`,
                )
                .join('; ')}
            </figcaption>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rows}
                margin={{ top: 24, right: 12, bottom: 0, left: -8 }}
                barCategoryGap="28%"
              >
                <defs>
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((grade) => (
                    <pattern
                      key={grade}
                      id={`${id}-hatch-${grade}`}
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="6" height="6" fill={CII_GRADE_COLORS[grade]} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2.5" />
                    </pattern>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(value: number) => format.number(value, 1)}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  content={(props) => (
                    <AnnualTooltip {...(props as TooltipContentProps<number, string>)} />
                  )}
                />
                <Bar
                  dataKey="attained"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={56}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.year}
                      fill={
                        row.grade
                          ? row.manual
                            ? `url(#${id}-hatch-${row.grade})`
                            : CII_GRADE_COLORS[row.grade]
                          : 'var(--muted-foreground)'
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="grade"
                    position="top"
                    className="fill-foreground text-xs font-bold"
                  />
                </Bar>
                <Line
                  dataKey="required"
                  type="monotone"
                  stroke="var(--foreground)"
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: 'var(--surface)', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </figure>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t('annual.tableLabel')}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('columns.year')}</TableHead>
                <TableHead>{t('columns.source')}</TableHead>
                <TableHead className="text-right">{t('columns.attained')}</TableHead>
                <TableHead className="text-right">{t('columns.required')}</TableHead>
                <TableHead className="text-right">{t('columns.rating')}</TableHead>
                <TableHead>{t('columns.grade')}</TableHead>
                <TableHead className="text-right">Z</TableHead>
                <TableHead className="text-right">{t('columns.distance')}</TableHead>
                <TableHead className="text-right">{t('columns.co2')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows].reverse().map((row) => (
                <TableRow key={row.year} className={row.manual ? 'bg-warning/5' : undefined}>
                  <TableCell className="font-mono font-semibold tabular-nums">{row.year}</TableCell>
                  <TableCell>
                    <SourceBadge source={row.item.source} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.cii(row.attained)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.cii(row.required)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.rating(row.item.rating)}
                  </TableCell>
                  <TableCell>
                    <GradeChip grade={row.grade} size="sm" />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {row.item.zPercent === null ? '—' : format.z(row.item.zPercent)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.number(row.item.distanceNm, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {format.number(row.item.co2Ton, 1)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Can permission="vessel:write">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onEditManual(row.year)}
                        aria-label={t('annual.editManualFor', { year: row.year })}
                      >
                        <FilePenLine />{' '}
                        <span className="hidden lg:inline">{t('annual.editManual')}</span>
                      </Button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {manualCount > 0
              ? t('annual.manualNote', { count: manualCount })
              : t('annual.segmentsNote')}{' '}
            <CiiUnit />
          </p>
          {weather && <DataAttribution />}
        </div>
        <MethodChips methodIds={methodIds} />
      </div>
    </Section>
  );
}
